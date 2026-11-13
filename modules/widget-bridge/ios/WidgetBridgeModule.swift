import ExpoModulesCore
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

    // The trip's cover, saved once so the widget can draw it offline. Never throws; false when it couldn't.
    AsyncFunction("saveImage") { (url: String, key: String) -> Bool in
      guard let u = URL(string: url),
            let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: WidgetBridgeModule.group),
            let data = try? Data(contentsOf: u) else { return false }
      return (try? data.write(to: dir.appendingPathComponent("\(key).jpg"))) != nil
    }

    Function("reload") {
      if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
    }
  }
}
