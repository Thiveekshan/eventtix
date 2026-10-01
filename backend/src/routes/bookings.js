'use strict';

const { Router } = require('express');

function bookingRoutes({ bookingService, auth }) {
  const router = Router();
  router.use(auth.authenticate);

  router.post('/', async (req, res) => {
    res.status(201).json(await bookingService.createBooking(req.user, req.body));
  });

  router.get('/', async (req, res) => {
    res.json(await bookingService.listBookings(req.user));
  });

  router.delete('/:id', async (req, res) => {
    res.json(await bookingService.cancelBooking(req.user, req.params.id));
  });

  return router;
}

module.exports = { bookingRoutes };
