const config = require("../config");

let serviceFeeRate = config.serviceFeeRate;

function getServiceFeeRate() {
  return serviceFeeRate;
}

function setServiceFeeRate(rate) {
  if (rate < 0 || rate > 0.5) return false;
  serviceFeeRate = rate;
  return true;
}

module.exports = { getServiceFeeRate, setServiceFeeRate };