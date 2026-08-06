const express = require('express');
const path = require('path');
const db = require('./db');
const questions = require('./questions');

function registerRoutes(app) {
    if (!app) return;

    // Mount Static Web Dashboard at /programming-dashboard
    try {
        app.use('/programming-dashboard', express.static(path.join(__dirname, 'dashboard')));
        console.log('✅ [Programming Challenge Web] Web Dashboard mounted at /programming-dashboard');
    } catch (e) {
        console.error('❌ Failed to mount programming dashboard:', e.message);
    }

    // Get Active Daily Challenge
    app.get('/api/challenge/current', async (req, res) => {
        try {
            const active = await db.getActiveChallenge();
            if (!active) {
                return res.json({ success: false, message: 'No active challenge' });
            }
            res.json({ success: true, challenge: active });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Get Leaderboard Data
    app.get('/api/challenge/leaderboard', async (req, res) => {
        try {
            const data = await db.getLeaderboardData();
            res.json({ success: true, leaderboard: data });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Get User Profile
    app.get('/api/challenge/profile/:userId', async (req, res) => {
        try {
            const profile = await db.getUserProfile(req.params.userId);
            res.json({ success: true, profile });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Get Question Bank
    app.get('/api/challenge/questions', (req, res) => {
        try {
            const list = questions.getAllQuestions();
            res.json({ success: true, count: list.length, questions: list });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log('🌐 [Programming Challenge Web] REST API routes mounted at /api/challenge/*');
}

module.exports = {
    registerRoutes
};
