import ExpoModulesCore
import ReplayKit
import AVFoundation

/// Records only this app's screen for the trip video (spec 2026-10-24-trip-video-design.md §3). No audio.
public class ScreenRecorderModule: Module {
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var started = false
  private var url: URL?
  private let queue = DispatchQueue(label: "supernova.screenrecorder")

  public func definition() -> ModuleDefinition {
    Name("ScreenRecorder")

    Function("isAvailable") { () -> Bool in
      RPScreenRecorder.shared().isAvailable
    }

    AsyncFunction("start") { (promise: Promise) in
      let recorder = RPScreenRecorder.shared()
      recorder.isMicrophoneEnabled = false
      self.reset()
      self.removeOldRecordings()
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("supernova-trip-\(UUID().uuidString).mp4")
      self.url = file
      recorder.startCapture(handler: { buffer, type, error in
        guard error == nil, type == .video else { return }
        self.queue.sync { self.append(buffer) }
      }, completionHandler: { error in
        if let error = error { promise.reject("E_RECORD_START", error.localizedDescription) } else { promise.resolve(nil) }
      })
    }

    AsyncFunction("stop") { (promise: Promise) in
      RPScreenRecorder.shared().stopCapture { _ in
        self.queue.async {
          guard let writer = self.writer, let input = self.input, self.started else {
            promise.reject("E_RECORD_EMPTY", "Nothing was recorded"); self.reset(); return
          }
          input.markAsFinished()
          writer.finishWriting {
            if writer.status == .completed, let url = self.url { promise.resolve(url.absoluteString) }
            else { promise.reject("E_RECORD_WRITE", writer.error?.localizedDescription ?? "Couldn't save the video") }
            self.writer = nil; self.input = nil; self.started = false
          }
        }
      }
    }

    /// Deletes a finished video once it has been shared (the share sheet has closed).
    Function("discard") { (uri: String) -> Void in
      if let url = URL(string: uri), url.isFileURL { try? FileManager.default.removeItem(at: url) }
    }

    AsyncFunction("cancel") { (promise: Promise) in
      RPScreenRecorder.shared().stopCapture { _ in
        self.queue.async {
          self.writer?.cancelWriting()
          if let url = self.url { try? FileManager.default.removeItem(at: url) }
          self.reset()
          promise.resolve(nil)
        }
      }
    }
  }

  /// Any earlier trip video still in tmp (an app killed mid-share) goes before a new one starts.
  private func removeOldRecordings() {
    let tmp = FileManager.default.temporaryDirectory
    let names = (try? FileManager.default.contentsOfDirectory(atPath: tmp.path)) ?? []
    for name in names where name.hasPrefix("supernova-trip-") { try? FileManager.default.removeItem(at: tmp.appendingPathComponent(name)) }
  }

  private func reset() {
    writer = nil; input = nil; started = false
  }

  private func append(_ buffer: CMSampleBuffer) {
    guard CMSampleBufferDataIsReady(buffer) else { return }
    if writer == nil {
      guard let url = url, let image = CMSampleBufferGetImageBuffer(buffer) else { return }
      let width = CVPixelBufferGetWidth(image), height = CVPixelBufferGetHeight(image)
      guard let w = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }
      let settings: [String: Any] = [AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height]
      let i = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
      i.expectsMediaDataInRealTime = true
      guard w.canAdd(i) else { return }
      w.add(i)
      writer = w; input = i
    }
    guard let writer = writer, let input = input else { return }
    if !started {
      guard writer.startWriting() else { return }
      writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(buffer))
      started = true
    }
    if input.isReadyForMoreMediaData { input.append(buffer) }
  }
}
