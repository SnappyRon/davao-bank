module.exports = new Proxy(
  {},
  {
    get: function (target, key) {
      return key;
    },
  }
);
