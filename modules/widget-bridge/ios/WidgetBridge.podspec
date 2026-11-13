Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '1.0.0'
  s.summary        = "Supernova's Home Screen widget bridge"
  s.description    = 'Writes the widget its precomputed entries through the App Group and asks WidgetKit to reload.'
  s.author         = 'Galaxie Labs'
  s.homepage       = 'https://supernova-a2125.web.app'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WidgetKit', 'UIKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
