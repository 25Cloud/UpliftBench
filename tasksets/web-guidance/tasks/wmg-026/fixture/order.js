export function placeOrder(cart, done) {
  reserve(cart, function (err, reservation) {
    if (err) return done(err);
    charge(reservation, function (err2, receipt) {
      if (err2) return done(err2);
      ship(receipt, function (err3, tracking) {
        if (err3) return done(err3);
        done(null, tracking);
      });
    });
  });
}
