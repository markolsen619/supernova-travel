import ExpoModulesCore
import PassKit

/// Apple's system "Add to Apple Wallet" button (PKAddPassButton), as Apple's guidelines require in apps.
/// It only reports taps; adding the pass is done by react-native-wallet-manager.
public class AddPassButtonModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AddPassButton")

    View(AddPassButtonView.self) {
      Events("onPress")

      Prop("buttonStyle") { (view: AddPassButtonView, style: String) in
        view.setStyle(style)
      }
    }
  }
}

class AddPassButtonView: ExpoView {
  let onPress = EventDispatcher()
  private let button = PKAddPassButton(addPassButtonStyle: .black)

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    button.addTarget(self, action: #selector(handleTap), for: .touchUpInside)
    addSubview(button)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    button.frame = bounds
  }

  func setStyle(_ style: String) {
    button.addPassButtonStyle = style == "blackOutline" ? .blackOutline : .black
  }

  @objc private func handleTap() {
    onPress([:])
  }
}
