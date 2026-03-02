const AuditContract = artifacts.require("AuditContract");

module.exports = function (deployer) {
  deployer.deploy(AuditContract);
};
