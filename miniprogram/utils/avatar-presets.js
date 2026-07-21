const AVATAR_PRESET_STYLES = {
  sprout: 'background: linear-gradient(145deg, #54c7a6, #177b6d);',
  sunrise: 'background: linear-gradient(145deg, #f3ba68, #d87358);',
  lake: 'background: linear-gradient(145deg, #6ab9cf, #397d9e);',
  berry: 'background: linear-gradient(145deg, #a88bd0, #6d5a9d);',
  coral: 'background: linear-gradient(145deg, #ef907e, #c85f61);',
  forest: 'background: linear-gradient(145deg, #7fb881, #3e785e);',
}

function getAvatarPresetStyle(preset) {
  return AVATAR_PRESET_STYLES[preset] || AVATAR_PRESET_STYLES.sprout
}

module.exports = {
  AVATAR_PRESET_STYLES,
  getAvatarPresetStyle,
}
