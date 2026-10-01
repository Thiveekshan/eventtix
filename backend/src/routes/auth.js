'use strict';

const { Router } = require('express');

function authRoutes({ authService }) {
  const router = Router();

  router.post('/register', async (req, res) => {
    res.status(201).json(await authService.register(req.body));
  });

  router.post('/login', async (req, res) => {
    res.json(await authService.login(req.body));
  });

  return router;
}

module.exports = { authRoutes };
