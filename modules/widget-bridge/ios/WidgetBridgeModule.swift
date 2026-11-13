import ExpoModulesCore
import UIKit
import WidgetKit

/// Hands the Home Screen widget its precomputed entries (utils/widgetTimeline) through the App Group
/// (spec docs/superpowers/specs/2026-11-12-packing-holidays-widget-design.md). No network from the widget itself.
public class WidgetBridgeModule: Module {
  static let group = "group.com.supernovatravel.app"

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Function("setEntries") { (json: String) in
      UserDefaults(suiteName: WidgetBridgeModule.group)?.set(json, forKey: "entries")
    }

    // The trip's cover, saved so the widget can draw it offline: at most 800 px on the long side (WidgetKit refuses
    // images over ~1 M px — final review), refreshed weekly, 15 s timeout. Never throws; false when it couldn't.
    AsyncFunction("saveImage") { (url: String, key: String) async -> Bool in
      guard let u = URL(string: url),
            let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: WidgetBridgeModule.group) else { return false }
      let file = dir.appendingPathComponent("\(key).jpg")
      if let attrs = try? FileManager.default.attributesOfItem(atPath: file.path),
         let modified = attrs[.modificationDate] as? Date,
         Date().timeIntervalSince(modified) < 7 * 24 * 3600 { return true }
      var request = URLRequest(url: u)
      request.timeoutInterval = 15
      guard let (data, _) = try? await URLSession.shared.data(for: request),
            let image = UIImage(data: data) else { return false }
      let longSide = max(image.size.width, image.size.height)
      let scale = longSide > 800 ? 800 / longSide : 1
      let size = CGSize(width: (image.size.width * scale).rounded(), height: (image.size.height * scale).rounded())
      let format = UIGraphicsImageRendererFormat()
      format.scale = 1
      let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
      guard let jpeg = resized.jpegData(compressionQuality: 0.8) else { return false }
      return (try? jpeg.write(to: file)) != nil
    }

    Function("reload") {
      if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
    }
  }
}
