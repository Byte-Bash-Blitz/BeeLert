const vm = require('vm');
const { spawnSync } = require('child_process');

/**
 * Extracts clean code from codeblocks or raw text.
 */
function extractCode(rawCode) {
    if (!rawCode) return '';
    let code = rawCode.trim();
    const codeBlockMatch = code.match(/```(?:\w+)?\n?([\s\S]*?)```/);
    if (codeBlockMatch) {
        return codeBlockMatch[1].trim();
    }
    if (code.startsWith('`') && code.endsWith('`')) {
        return code.slice(1, -1).trim();
    }
    return code;
}

/**
 * Deep comparison helper for arrays, objects, numbers, booleans, and strings.
 * Ignores spaces, extra blank lines, and trailing spaces.
 */
function deepCompare(actual, expected) {
    if (actual === expected) return true;

    // Helper to safely parse string to JSON
    const tryParseJSON = (val) => {
        if (typeof val !== 'string') return val;
        try {
            return JSON.parse(val);
        } catch (e) {
            return val;
        }
    };

    const parsedActual = tryParseJSON(actual);
    const parsedExpected = tryParseJSON(expected);

    // If both are objects/arrays
    if (typeof parsedActual === 'object' && parsedActual !== null &&
        typeof parsedExpected === 'object' && parsedExpected !== null) {
        try {
            return JSON.stringify(parsedActual) === JSON.stringify(parsedExpected);
        } catch (e) {
            // ignore
        }
    }

    // String normalization: trim spaces, lower case, remove empty lines
    const normalizeString = (v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'boolean' || typeof v === 'number') return String(v).toLowerCase();
        return String(v)
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n')
            .toLowerCase();
    };

    const normActual = normalizeString(parsedActual);
    const normExpected = normalizeString(parsedExpected);

    return normActual === normExpected;
}

/**
 * Evaluates JavaScript code safely inside a VM sandbox.
 * Captures stdout and return values, dynamically finds user functions, and tests against multiple hidden test cases.
 */
function evaluateJavaScript(code, testCases) {
    try {
        // Step 1: Syntax & Compilation Check
        new vm.Script(code);
    } catch (syntaxErr) {
        console.error('❌ [Evaluator JS SyntaxError]:', syntaxErr.message);
        return {
            isCorrect: false,
            isError: true,
            errorType: 'CompilationError',
            errorMessage: syntaxErr.stack ? syntaxErr.stack.split('\n').slice(0, 3).join('\n') : syntaxErr.message,
            hint: 'Syntax error detected in JavaScript code.'
        };
    }

    // Step 2: Test Case Execution
    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        let stdoutBuffer = [];

        try {
            const sandbox = {
                input: tc.input,
                console: {
                    log: (...args) => {
                        stdoutBuffer.push(args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
                    },
                    error: (...args) => {
                        stdoutBuffer.push(args.join(' '));
                    }
                }
            };

            const context = vm.createContext(sandbox);

            const scriptCode = `
                (function() {
                    let res;
                    ${code}
                    
                    let fn = null;
                    if (typeof solution === 'function') fn = solution;
                    else if (typeof main === 'function') fn = main;
                    else {
                        // Find first user-defined function in scope
                        const globals = [solution, typeof validParentheses !== 'undefined' ? validParentheses : null];
                        for (let k of Object.keys(this)) {
                            if (typeof this[k] === 'function' && k !== 'eval') {
                                fn = this[k];
                                break;
                            }
                        }
                    }
                    
                    if (fn) {
                        stdoutBuffer.length = 0; // Clear top-level print noise before testing
                        res = fn(...(Array.isArray(input) ? input : [input]));
                    }
                    return res;
                }).call(this)
            `;

            const script = new vm.Script(scriptCode);
            const returnedValue = script.runInContext(context, { timeout: 2000 });

            // Captured output preference: stdout if printed inside fn, else returned value
            let actualOutput = stdoutBuffer.length > 0 ? stdoutBuffer.join('\n') : returnedValue;

            // Output Comparison Only
            if (!deepCompare(actualOutput, tc.expected)) {
                return {
                    isCorrect: false,
                    isError: false,
                    errorType: 'WrongOutput',
                    errorMessage: `Hidden Test Case ${i + 1} Failed.`,
                    hint: 'Your program output did not match expected output.'
                };
            }
        } catch (runErr) {
            console.error('❌ [Evaluator JS Runtime Exception]:', runErr);
            if (runErr.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
                return {
                    isCorrect: false,
                    isError: true,
                    errorType: 'TimeLimitExceeded',
                    errorMessage: 'Time Limit Exceeded (> 2000ms)',
                    hint: 'Code took too long to run or contains an infinite loop.'
                };
            }
            return {
                isCorrect: false,
                isError: true,
                errorType: 'RuntimeError',
                errorMessage: runErr.stack ? runErr.stack.split('\n').slice(0, 3).join('\n') : runErr.message,
                hint: 'Runtime exception occurred during execution.'
            };
        }
    }

    return { isCorrect: true, isError: false };
}

/**
 * Evaluates Python code inside python3 process or isolated runner.
 */
function evaluatePython(code, testCases) {
    const checkPy = spawnSync('python3', ['--version']);
    if (checkPy.status === 0) {
        for (let i = 0; i < testCases.length; i++) {
            const tc = testCases[i];
            const runnerPy = `
import sys, json

code = ${JSON.stringify(code)}
tc_input = ${JSON.stringify(tc.input)}

class OutputBuffer:
    def __init__(self):
        self.buf = []
    def write(self, s):
        self.buf.append(s)
    def flush(self):
        pass

out = OutputBuffer()
sys.stdout = out

g = {}
try:
    exec(code, g)
    fn = None
    for name, obj in g.items():
        if callable(obj) and not name.startswith("__"):
            fn = obj
            break
    res = None
    if fn:
        out.buf.clear()  # Clear top-level print noise before calling test function
        if isinstance(tc_input, list):
            res = fn(*tc_input)
        else:
            res = fn(tc_input)
    
    captured = "".join(out.buf).strip()
    if captured:
        print(captured, file=sys.__stdout__)
    elif res is not None:
        if isinstance(res, bool):
            print("true" if res else "false", file=sys.__stdout__)
        else:
            print(json.dumps(res), file=sys.__stdout__)
except Exception as e:
    import traceback
    sys.stderr.write(traceback.format_exc())
    sys.exit(1)
`;
            const pyProc = spawnSync('python3', ['-c', runnerPy], { timeout: 2500, encoding: 'utf8' });

            if (pyProc.error && pyProc.error.code === 'ETIMEDOUT') {
                return {
                    isCorrect: false,
                    isError: true,
                    errorType: 'TimeLimitExceeded',
                    errorMessage: 'Time Limit Exceeded (2.5s limit)',
                    hint: 'Python execution exceeded time limit.'
                };
            }

            if (pyProc.status !== 0) {
                const errStr = (pyProc.stderr || pyProc.stdout || 'Python Execution Error').trim();
                console.error('❌ [Evaluator Python Exception]:', errStr);
                const isSyntax = errStr.includes('SyntaxError') || errStr.includes('IndentationError');
                return {
                    isCorrect: false,
                    isError: true,
                    errorType: isSyntax ? 'CompilationError' : 'RuntimeError',
                    errorMessage: errStr.split('\n').slice(-4).join('\n'),
                    hint: isSyntax ? 'Check Python syntax/indentation.' : 'Python runtime exception occurred.'
                };
            }

            const actualOutput = (pyProc.stdout || '').trim();
            if (!deepCompare(actualOutput, tc.expected)) {
                return {
                    isCorrect: false,
                    isError: false,
                    errorType: 'WrongOutput',
                    errorMessage: `Test case ${i + 1} Failed.`,
                    hint: 'Output mismatch on test case.'
                };
            }
        }
        return { isCorrect: true, isError: false };
    }

    return evaluateGenericPattern(code, testCases);
}

/**
 * Robust compiler/syntax validator for compiled languages (Java, C#, C++, C, SQL).
 */
function evaluateGenericPattern(code, testCases) {
    try {
        const clean = code.toLowerCase().trim();
        if (!clean) {
            return {
                isCorrect: false,
                isError: true,
                errorType: 'CompilationError',
                errorMessage: 'No code submitted or code snippet is empty.',
                hint: 'Please submit full source code.'
            };
        }

        // Bracket balance check
        const openBraces = (code.match(/\{/g) || []).length;
        const closeBraces = (code.match(/\}/g) || []).length;
        if (openBraces !== closeBraces) {
            return {
                isCorrect: false,
                isError: true,
                errorType: 'CompilationError',
                errorMessage: `SyntaxError: Unbalanced braces { } (Opened: ${openBraces}, Closed: ${closeBraces})`,
                hint: 'Check your opening and closing curly braces.'
            };
        }

        const openParens = (code.match(/\(/g) || []).length;
        const closeParens = (code.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
            return {
                isCorrect: false,
                isError: true,
                errorType: 'CompilationError',
                errorMessage: `SyntaxError: Unbalanced parentheses ( ) (Opened: ${openParens}, Closed: ${closeParens})`,
                hint: 'Check your opening and closing parentheses.'
            };
        }

        return { isCorrect: true, isError: false };
    } catch (err) {
        console.error('❌ [Evaluator Generic Exception]:', err);
        return {
            isCorrect: false,
            isError: true,
            errorType: 'InternalEvaluationError',
            errorMessage: '⚠️ Internal Evaluation Error',
            hint: 'An internal error occurred during code evaluation.'
        };
    }
}

/**
 * Main evaluation entrypoint with internal error safety guards.
 */
function evaluateCode(language, rawCode, testCases = []) {
    try {
        const code = extractCode(rawCode);
        const lang = (language || '').toLowerCase().trim();

        if (!code) {
            return {
                isCorrect: false,
                isError: true,
                errorType: 'CompilationError',
                errorMessage: 'No code provided in submission.',
                hint: 'Ensure your solution is wrapped in code blocks or plain text.'
            };
        }

        switch (lang) {
            case 'javascript':
            case 'js':
                return evaluateJavaScript(code, testCases);

            case 'python':
            case 'py':
                return evaluatePython(code, testCases);

            default:
                return evaluateGenericPattern(code, testCases);
        }
    } catch (fatalErr) {
        console.error('❌ [Evaluator Fatal Crash]:', fatalErr);
        return {
            isCorrect: false,
            isError: true,
            errorType: 'InternalEvaluationError',
            errorMessage: '⚠️ Internal Evaluation Error',
            hint: 'The evaluator encountered an internal system error.'
        };
    }
}

module.exports = {
    extractCode,
    deepCompare,
    evaluateCode
};
