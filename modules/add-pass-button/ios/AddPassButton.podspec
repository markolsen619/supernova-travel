Pod::Spec.new do |s|
  s.name           = 'AddPassButton'
  s.version        = '1.0.0'
  s.summary        = "Apple's PKAddPassButton for Supernova"
  s.description    = "Apple's system Add to Apple Wallet button (PKAddPassButton) as an Expo view."
  s.author         = 'Galaxie Labs'
  s.homepage       = 'https://supernova-a2125.web.app'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PassKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
