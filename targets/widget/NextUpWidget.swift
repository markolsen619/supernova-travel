import WidgetKit
import SwiftUI

/// Supernova's Home Screen widget (spec 2026-11-12): shows the precomputed entries the app writes to the App Group
/// (utils/widgetTimeline) — flight day, trip day, countdown, or plan your next trip. No network.
struct WView: Codable { let kind: String; let eyebrow: String; let title: String; let detail: String?; let second: String?; let url: String; let imageKey: String? }
struct WEntryJSON: Codable { let at: Double; let view: WView }
struct NextUpEntry: TimelineEntry { let date: Date; let view: WView }

let group = "group.com.supernovatravel.app"
let placeholderView = WView(kind: "empty", eyebrow: "SUPERNOVA", title: "Plan your next trip", detail: nil, second: nil, url: "supernova://create", imageKey: nil)

func loadEntries() -> [NextUpEntry] {
  guard let json = UserDefaults(suiteName: group)?.string(forKey: "entries"),
        let data = json.data(using: .utf8),
        let list = try? JSONDecoder().decode([WEntryJSON].self, from: data), !list.isEmpty else {
    return [NextUpEntry(date: Date(), view: placeholderView)]
  }
  let now = Date()
  let entries = list.map { NextUpEntry(date: Date(timeIntervalSince1970: $0.at / 1000), view: $0.view) }
  // Start from the entry in effect now, so the widget never shows a stale past moment.
  let current = entries.last(where: { $0.date <= now }) ?? entries[0]
  return [NextUpEntry(date: now, view: current.view)] + entries.filter { $0.date > now }
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> NextUpEntry { NextUpEntry(date: Date(), view: placeholderView) }
  func getSnapshot(in context: Context, completion: @escaping (NextUpEntry) -> Void) { completion(loadEntries()[0]) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<NextUpEntry>) -> Void) {
    // Re-read every 6 h rather than .atEnd: once the saved entries run out, .atEnd would reload in a loop (final review).
    completion(Timeline(entries: loadEntries(), policy: .after(Date().addingTimeInterval(6 * 3600))))
  }
}

struct NextUpView: View {
  @Environment(\.widgetFamily) var family
  let entry: NextUpEntry
  var image: UIImage? {
    guard let key = entry.view.imageKey,
          let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return nil }
    return UIImage(contentsOfFile: dir.appendingPathComponent("\(key).jpg").path)
  }
  var body: some View {
    let v = entry.view
    VStack(alignment: .leading, spacing: 4) {
      Text(v.eyebrow).font(.system(size: 11, weight: .semibold)).tracking(0.9).foregroundStyle(.white.opacity(0.75)).lineLimit(1)
      Spacer(minLength: 0)
      Text(v.title).font(.system(size: family == .systemSmall ? 17 : 20, weight: .semibold)).foregroundStyle(.white).lineLimit(2)
      if let d = v.detail { Text(d).font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.9)).lineLimit(1) }
      if family != .systemSmall, let s = v.second { Text(s).font(.system(size: 13)).foregroundStyle(.white.opacity(0.75)).lineLimit(1) }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .widgetURL(URL(string: v.url))
    .containerBackground(for: .widget) {
      ZStack {
        LinearGradient(colors: [Color(red: 0.10, green: 0.06, blue: 0.21), Color(red: 0.06, green: 0.04, blue: 0.16)], startPoint: .topLeading, endPoint: .bottomTrailing)
        if let img = image { Image(uiImage: img).resizable().scaledToFill(); LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom) }
      }
    }
  }
}

@main
struct NextUpWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NextUp", provider: Provider()) { entry in NextUpView(entry: entry) }
      .configurationDisplayName("Next up")
      .description("Your next flight, today's next stop, or the countdown to your trip.")
      .supportedFamilies([.systemSmall, .systemMedium])
  }
}
