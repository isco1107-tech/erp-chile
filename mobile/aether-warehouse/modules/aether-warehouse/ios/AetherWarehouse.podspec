Pod::Spec.new do |s|
  s.name = 'AetherWarehouse'
  s.version = '1.0.0'
  s.summary = 'Lectura local de etiquetas y transporte seguro de Aether Bodega'
  s.description = s.summary
  s.license = { :type => 'Proprietary' }
  s.author = 'Aether'
  s.homepage = 'https://example.invalid'
  s.platform = :ios, '16.0'
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleMLKit/TextRecognition', '~> 9.0'
  s.source_files = '**/*.{h,m,mm,swift}'
end
