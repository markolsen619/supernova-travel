import ExpoModulesCore
import ReplayKit
import AVFoundation
import CoreImage
import UIKit

/// Records only this app's screen for the trip video (spec 2026-10-24-trip-video-design.md §3). No audio.
/// Every frame is cropped to the trip map's rectangle: the trip page is a sheet, and ReplayKit records the whole
/// window (the sheet's edge and the dimmed screen behind it). All recorder state lives on `queue`.
public class ScreenRecorderModule: Module {
  private let queue = DispatchQueue(label: "supernova.screenrecorder")
  private let ciContext = CIContext(options: [.cacheIntermediates: false])
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var started = false
  private var capturing = false
  private var url: URL?
  /// The map's rectangle in window points, and the window's width in points (to scale to the buffer's pixels).
  private var cropPoints = CGRect.zero
  private var windowWidth: CGFloat = 0
  private var cropPixels = CGRect.zero

  public func definition() -> ModuleDefinition {
    Name("ScreenRecorder")

    Function("isAvailable") { () -> Bool in
      RPScreenRecorder.shared().isAvailable
    }

    AsyncFunction("start") { (x: Double, y: Double, width: Double, height: Double, windowW: Double, promise: Promise) in
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("supernova-trip-\(UUID().uuidString).mp4")
      self.queue.sync {
        self.removeOldRecordings()
        self.resetWriter()
        self.url = file
        self.cropPoints = CGRect(x: x, y: y, width: width, height: height)
        self.windowWidth = CGFloat(windowW)
        self.capturing = true
      }
      DispatchQueue.main.async {
        UIApplication.shared.isIdleTimerDisabled = true
        let recorder = RPScreenRecorder.shared()
        recorder.isMicrophoneEnabled = false
        recorder.startCapture(handler: { buffer, type, error in
          guard error == nil, type == .video else { return }
          self.queue.async { self.append(buffer) }
        }, completionHandler: { error in
          if let error = error {
            self.queue.sync { self.capturing = false }
            DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
            promise.reject("E_RECORD_START", error.localizedDescription)
          } else {
            promise.resolve(nil)
          }
        })
      }
    }

    AsyncFunction("stop") { (promise: Promise) in
      self.queue.sync { self.capturing = false }
      DispatchQueue.main.async {
        UIApplication.shared.isIdleTimerDisabled = false
        RPScreenRecorder.shared().stopCapture { _ in
          self.queue.async {
            guard let writer = self.writer, let input = self.input, self.started else {
              self.resetWriter()
              promise.reject("E_RECORD_EMPTY", "Nothing was recorded")
              return
            }
            input.markAsFinished()
            let url = self.url
            writer.finishWriting {
              self.queue.async {
                self.resetWriter()
                if writer.status == .completed, let url = url { promise.resolve(url.absoluteString) }
                else { promise.reject("E_RECORD_WRITE", writer.error?.localizedDescription ?? "Couldn't save the video") }
              }
            }
          }
        }
      }
    }

    AsyncFunction("cancel") { (promise: Promise) in
      self.queue.sync { self.capturing = false }
      DispatchQueue.main.async {
        UIApplication.shared.isIdleTimerDisabled = false
        RPScreenRecorder.shared().stopCapture { _ in
          self.queue.async {
            self.writer?.cancelWriting()
            if let url = self.url { try? FileManager.default.removeItem(at: url) }
            self.resetWriter()
            promise.resolve(nil)
          }
        }
      }
    }

    /// Deletes a finished video once it has been shared (the share sheet has closed).
    Function("discard") { (uri: String) -> Void in
      if let url = URL(string: uri), url.isFileURL { try? FileManager.default.removeItem(at: url) }
    }
  }

  /// Any earlier trip video still in tmp (an app killed mid-share) goes before a new one starts.
  private func removeOldRecordings() {
    let tmp = FileManager.default.temporaryDirectory
    let names = (try? FileManager.default.contentsOfDirectory(atPath: tmp.path)) ?? []
    for name in names where name.hasPrefix("supernova-trip-") { try? FileManager.default.removeItem(at: tmp.appendingPathComponent(name)) }
  }

  private func resetWriter() {
    writer = nil; input = nil; adaptor = nil; started = false
  }

  /// Even pixel rectangle of the map inside a buffer of this size (H.264 wants even dimensions).
  private func pixelCrop(bufferWidth: Int, bufferHeight: Int) -> CGRect {
    let full = CGRect(x: 0, y: 0, width: bufferWidth, height: bufferHeight)
    guard windowWidth > 0, cropPoints.width > 0, cropPoints.height > 0 else { return full }
    let scale = CGFloat(bufferWidth) / windowWidth
    var r = CGRect(x: cropPoints.minX * scale, y: cropPoints.minY * scale, width: cropPoints.width * scale, height: cropPoints.height * scale)
      .integral.intersection(full)
    if r.isNull || r.width < 2 || r.height < 2 { r = full }
    r.size.width = CGFloat(Int(r.width) / 2 * 2)
    r.size.height = CGFloat(Int(r.height) / 2 * 2)
    return r
  }

  private func append(_ buffer: CMSampleBuffer) {
    guard capturing, CMSampleBufferDataIsReady(buffer), let image = CMSampleBufferGetImageBuffer(buffer) else { return }
    let time = CMSampleBufferGetPresentationTimeStamp(buffer)
    if writer == nil {
      guard let url = url else { return }
      cropPixels = pixelCrop(bufferWidth: CVPixelBufferGetWidth(image), bufferHeight: CVPixelBufferGetHeight(image))
      guard let w = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }
      let width = Int(cropPixels.width), height = Int(cropPixels.height)
      let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 10_000_000],
      ]
      let i = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
      i.expectsMediaDataInRealTime = true
      let a = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: i, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
      ])
      guard w.canAdd(i) else { return }
      w.add(i)
      writer = w; input = i; adaptor = a
    }
    guard let writer = writer, let input = input, let adaptor = adaptor else { return }
    if !started {
      guard writer.startWriting() else { return }
      writer.startSession(atSourceTime: time)
      started = true
    }
    guard input.isReadyForMoreMediaData, let pool = adaptor.pixelBufferPool else { return }
    var out: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out) == kCVReturnSuccess, let target = out else { return }
    // CVPixelBuffer rows run top-down; Core Image's origin is bottom-left.
    let bufferHeight = CGFloat(CVPixelBufferGetHeight(image))
    let ciRect = CGRect(x: cropPixels.minX, y: bufferHeight - cropPixels.maxY, width: cropPixels.width, height: cropPixels.height)
    let cropped = CIImage(cvPixelBuffer: image).cropped(to: ciRect).transformed(by: CGAffineTransform(translationX: -ciRect.minX, y: -ciRect.minY))
    ciContext.render(cropped, to: target)
    adaptor.append(target, withPresentationTime: time)
  }
}
