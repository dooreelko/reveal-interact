module.exports = {
  default: {
    requireModule: ['ts-node/register'],
    require: ['features/**/*.ts'],
    format: ['progress'],
    publishQuiet: true
  }
}
