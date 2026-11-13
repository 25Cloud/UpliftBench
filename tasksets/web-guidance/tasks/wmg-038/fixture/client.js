export function loadAll(items) {
  return Promise.resolve(items)
    .then(function (list) {
      return list.map(function (i) {
        return fetchOne(i);
      });
    })
    .catch(function (e) {
      console.log(e);
    });
}
