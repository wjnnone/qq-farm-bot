import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  unocss: true,
  formatters: true,
  rules: {
    'no-alert': 'off',
  },
})
