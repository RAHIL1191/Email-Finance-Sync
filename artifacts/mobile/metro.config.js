const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const extraBlockList = [
  /android[\/\\].*/,
  /\.expo[\/\\].*/,
];

if (Array.isArray(config.resolver.blockList)) {
  config.resolver.blockList.push(...extraBlockList);
} else if (config.resolver.blockList) {
  config.resolver.blockList = [config.resolver.blockList, ...extraBlockList];
} else {
  config.resolver.blockList = extraBlockList;
}

module.exports = config;

