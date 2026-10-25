package expo.modules.screenrecorder

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.Rect
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.Choreographer
import android.view.PixelCopy
import android.view.Surface
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The trip video on Android (spec 2026-10-25-android-trip-video-design.md): ~30 times a second the map's surface is
 * copied (PixelCopy), the film overlay view is drawn on top, and the frame goes to an H.264 encoder. No screen
 * recording, so no system prompt.
 */
class ScreenRecorderModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var copyThread: HandlerThread? = null
  private var encodeThread: HandlerThread? = null
  private var codec: MediaCodec? = null
  private var inputSurface: Surface? = null
  private var muxer: MediaMuxer? = null
  private var track = -1
  private var muxerStarted = false
  private var file: File? = null
  private var mapView: View? = null
  private var overlay: View? = null
  private var mapBitmap: Bitmap? = null
  private var overlayBitmap: Bitmap? = null
  private var outW = 0
  private var outH = 0
  private var lastFrameMs = -1L
  private val running = AtomicBoolean(false)
  private val busy = AtomicBoolean(false)
  private var frameCallback: Choreographer.FrameCallback? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenRecorder")

    Function("isAvailable") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.N }

    AsyncFunction("startViews") { mapRootTag: Int, overlayTag: Int, promise: Promise ->
      main.post {
        try {
          cleanup(deleteFile = true)
          val root = appContext.findView<View>(mapRootTag) ?: throw IllegalStateException("Map view not found")
          val surface = findSurface(root) ?: throw IllegalStateException("Map surface not found")
          val over = appContext.findView<View>(overlayTag) ?: throw IllegalStateException("Overlay not found")
          val w = surface.width
          val h = surface.height
          if (w < 2 || h < 2) throw IllegalStateException("Map not laid out")
          val scale = minOf(1f, 1080f / w)
          outW = maxOf(2, ((w * scale).toInt() / 2) * 2)
          outH = maxOf(2, ((h * scale).toInt() / 2) * 2)
          mapView = surface
          overlay = over
          mapBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
          overlayBitmap = Bitmap.createBitmap(over.width.coerceAtLeast(1), over.height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
          val out = File(appContext.reactContext?.cacheDir ?: throw IllegalStateException("No cache dir"), "supernova-trip-${UUID.randomUUID()}.mp4")
          file = out
          startEncoder(out)
          appContext.currentActivity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
          running.set(true)
          lastFrameMs = -1L
          val cb = object : Choreographer.FrameCallback {
            override fun doFrame(frameTimeNanos: Long) {
              if (!running.get()) return
              val now = frameTimeNanos / 1_000_000
              if ((lastFrameMs < 0 || now - lastFrameMs >= 33) && busy.compareAndSet(false, true)) {
                lastFrameMs = now
                captureFrame()
              }
              Choreographer.getInstance().postFrameCallback(this)
            }
          }
          frameCallback = cb
          Choreographer.getInstance().postFrameCallback(cb)
          promise.resolve(null)
        } catch (e: Exception) {
          cleanup(deleteFile = true)
          promise.reject("E_RECORD_START", e.message ?: "Couldn't start recording", e)
        }
      }
    }

    AsyncFunction("stop") { promise: Promise ->
      main.post {
        running.set(false)
        frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
        appContext.currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val handler = encodeThread?.let { Handler(it.looper) }
        if (handler == null) {
          cleanup(deleteFile = true)
          promise.reject("E_RECORD_EMPTY", "Nothing was recorded", null)
          return@post
        }
        handler.post {
          try {
            codec?.signalEndOfInputStream()
            drain(endOfStream = true)
            val ok = muxerStarted
            val out = file
            releaseEncoder()
            main.post {
              cleanup(deleteFile = !ok)
              if (ok && out != null) promise.resolve(Uri.fromFile(out).toString())
              else promise.reject("E_RECORD_EMPTY", "Nothing was recorded", null)
            }
          } catch (e: Exception) {
            releaseEncoder()
            main.post {
              cleanup(deleteFile = true)
              promise.reject("E_RECORD_WRITE", e.message ?: "Couldn't save the video", e)
            }
          }
        }
      }
    }

    AsyncFunction("cancel") { promise: Promise ->
      main.post {
        running.set(false)
        frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
        appContext.currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val handler = encodeThread?.let { Handler(it.looper) }
        if (handler == null) {
          cleanup(deleteFile = true)
          promise.resolve(null)
          return@post
        }
        handler.post {
          releaseEncoder()
          main.post { cleanup(deleteFile = true); promise.resolve(null) }
        }
      }
    }

    Function("discard") { uri: String ->
      Uri.parse(uri).path?.let { File(it).delete() }
      Unit
    }

    OnDestroy {
      running.set(false)
      main.post {
        frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
        encodeThread?.let { t -> Handler(t.looper).post { releaseEncoder(); main.post { cleanup(deleteFile = true) } } } ?: cleanup(deleteFile = true)
      }
    }
  }

  /** The first SurfaceView or TextureView under the map's root (Mapbox draws into one of them). */
  private fun findSurface(v: View): View? {
    if (v is SurfaceView || v is TextureView) return v
    if (v is ViewGroup) for (i in 0 until v.childCount) findSurface(v.getChildAt(i))?.let { return it }
    return null
  }

  private fun startEncoder(out: File) {
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, outW, outH).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, 10_000_000)
      setInteger(MediaFormat.KEY_FRAME_RATE, 30)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val c = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    c.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    inputSurface = c.createInputSurface()
    c.start()
    codec = c
    muxer = MediaMuxer(out.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    track = -1
    muxerStarted = false
    copyThread = HandlerThread("supernova-copy").also { it.start() }
    encodeThread = HandlerThread("supernova-encode").also { it.start() }
  }

  /** Main thread: copy the map, then draw the overlay, then hand both to the encoder thread. */
  private fun captureFrame() {
    val map = mapView
    val mapBmp = mapBitmap
    val copy = copyThread
    if (map == null || mapBmp == null || copy == null) { busy.set(false); return }
    val afterCopy = { ok: Boolean ->
      main.post {
        if (!ok || !running.get()) { busy.set(false); return@post }
        drawOverlay()
        val enc = encodeThread
        if (enc == null) { busy.set(false); return@post }
        Handler(enc.looper).post { encodeFrame(); busy.set(false) }
      }
    }
    when (map) {
      is SurfaceView -> try {
        PixelCopy.request(map, mapBmp, { result -> afterCopy(result == PixelCopy.SUCCESS) }, Handler(copy.looper))
      } catch (e: Exception) { busy.set(false) }
      is TextureView -> { map.getBitmap(mapBmp); afterCopy(true) }
      else -> busy.set(false)
    }
  }

  private fun drawOverlay() {
    val over = overlay ?: return
    var bmp = overlayBitmap ?: return
    if (bmp.width != over.width || bmp.height != over.height) {
      if (over.width < 1 || over.height < 1) return
      bmp.recycle()
      bmp = Bitmap.createBitmap(over.width, over.height, Bitmap.Config.ARGB_8888)
      overlayBitmap = bmp
    }
    bmp.eraseColor(Color.TRANSPARENT)
    over.draw(Canvas(bmp))
  }

  /** Encoder thread: map then overlay onto the codec's input surface, then pull out what's encoded. */
  private fun encodeFrame() {
    val surface = inputSurface ?: return
    val map = mapBitmap ?: return
    val canvas = try { surface.lockHardwareCanvas() } catch (e: Exception) { return }
    try {
      canvas.drawColor(Color.BLACK, PorterDuff.Mode.SRC)
      val dst = Rect(0, 0, outW, outH)
      canvas.drawBitmap(map, null, dst, null)
      overlayBitmap?.let { canvas.drawBitmap(it, null, dst, null) }
    } finally {
      surface.unlockCanvasAndPost(canvas)
    }
    drain(endOfStream = false)
  }

  private fun drain(endOfStream: Boolean) {
    val c = codec ?: return
    val m = muxer ?: return
    val info = MediaCodec.BufferInfo()
    while (true) {
      val index = c.dequeueOutputBuffer(info, if (endOfStream) 10_000 else 0)
      when {
        index == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream) return
        index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          if (!muxerStarted) { track = m.addTrack(c.outputFormat); m.start(); muxerStarted = true }
        }
        index >= 0 -> {
          val buf = c.getOutputBuffer(index)
          if ((info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) info.size = 0
          if (info.size > 0 && muxerStarted && buf != null) {
            buf.position(info.offset)
            buf.limit(info.offset + info.size)
            m.writeSampleData(track, buf, info)
          }
          c.releaseOutputBuffer(index, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
        }
      }
    }
  }

  /** Encoder thread. */
  private fun releaseEncoder() {
    try { codec?.stop() } catch (_: Exception) {}
    try { codec?.release() } catch (_: Exception) {}
    try { inputSurface?.release() } catch (_: Exception) {}
    try { if (muxerStarted) muxer?.stop() } catch (_: Exception) {}
    try { muxer?.release() } catch (_: Exception) {}
    codec = null; inputSurface = null; muxer = null
  }

  /** Main thread. */
  private fun cleanup(deleteFile: Boolean) {
    running.set(false)
    frameCallback?.let { Choreographer.getInstance().removeFrameCallback(it) }
    frameCallback = null
    appContext.currentActivity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    copyThread?.quitSafely(); copyThread = null
    encodeThread?.quitSafely(); encodeThread = null
    mapBitmap?.recycle(); mapBitmap = null
    overlayBitmap?.recycle(); overlayBitmap = null
    mapView = null; overlay = null
    if (deleteFile) file?.delete()
    file = null
    muxerStarted = false
    busy.set(false)
  }
}
