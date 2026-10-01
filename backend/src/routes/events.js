'use strict';

const { Router } = require('express');

function eventRoutes({ eventService, auth }) {
  const router = Router();
  const adminOnly = [auth.authenticate, auth.requireRole('admin')];

  router.get('/', async (req, res) => {
    res.json(await eventService.list());
  });

  router.get('/:id', async (req, res) => {
    res.json(await eventService.get(req.params.id));
  });

  router.post('/', adminOnly, async (req, res) => {
    res.status(201).json(await eventService.create(req.body));
  });

  router.put('/:id', adminOnly, async (req, res) => {
    res.json(await eventService.update(req.params.id, req.body));
  });

  router.delete('/:id', adminOnly, async (req, res) => {
    await eventService.remove(req.params.id);
    res.status(204).end();
  });

  return router;
}

module.exports = { eventRoutes };
