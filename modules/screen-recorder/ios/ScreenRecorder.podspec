Pod::Spec.new do |s|
  s.name           = 'ScreenRecorder'
  s.version        = '1.0.0'
  s.summary        = "In-app screen recording for Supernova's trip video"
  s.description    = "Records only this app's screen with ReplayKit and writes an H.264 MP4 (no audio)."
  s.author         = 'Galaxie Labs'
  s.homepage       = 'https://supernova-a2125.web.app'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ReplayKit', 'AVFoundation'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
