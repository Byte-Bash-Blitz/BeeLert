const db = require('./db');
const { extractCode } = require('./evaluator');

const userLastSubmission = new Map(); // userId -> timestamp

/**
 * Calculates Levenshtein distance between two strings.
 */
function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}

/**
 * Calculates code similarity ratio (0 to 1).
 */
function calculateCodeSimilarity(code1, code2) {
    const clean1 = extractCode(code1).replace(/\s+/g, '');
    const clean2 = extractCode(code2).replace(/\s+/g, '');
    if (!clean1 || !clean2) return 0;
    if (clean1 === clean2) return 1.0;

    const maxLen = Math.max(clean1.length, clean2.length);
    if (maxLen === 0) return 1.0;

    const distance = levenshteinDistance(clean1, clean2);
    return 1 - (distance / maxLen);
}

/**
 * Validates anti-cheat rules before submission processing.
 */
async function checkAntiCheat(userId, challengeId, rawCode) {
    const now = Date.now();

    // 1. Rate limiting (Spam prevention) - 5 seconds cooldown
    const lastTime = userLastSubmission.get(userId) || 0;
    if (now - lastTime < 5000) {
        return {
            allowed: false,
            reason: '⏳ Slow down! Please wait a few seconds before submitting again.'
        };
    }
    userLastSubmission.set(userId, now);


    // 3. Similarity check against previously accepted correct solutions
    const previousSubmissions = await db.getRecentSubmissions(challengeId);
    const correctSubmissions = previousSubmissions.filter(s => s.isCorrect && s.userId !== userId);

    for (const prev of correctSubmissions) {
        const sim = calculateCodeSimilarity(rawCode, prev.code);
        if (sim > 0.92) {
            return {
                allowed: false,
                reason: '🚫 Solution flagged: Code is identical or nearly identical to another member\'s submitted answer.'
            };
        }
    }

    return { allowed: true };
}

module.exports = {
    checkAntiCheat,
    calculateCodeSimilarity
};
