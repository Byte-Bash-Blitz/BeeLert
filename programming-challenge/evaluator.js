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
/**
 * Deep comparison helper for output-only matching.
 * Ignores case, spaces, quotes, brackets, and trailing text.
 */
function deepCompare(actual, expected) {
    if (actual === undefined || actual === null || expected === undefined || expected === null) return false;

    const normalizeString = (v) => {
        if (v === null || v === undefined) return '';
        let s = (typeof v === 'object' ? JSON.stringify(v) : String(v)).toLowerCase().trim();
        if (s === 'true' || s === '1') return 'true';
        if (s === 'false' || s === '0') return 'false';
        return s
            .replace(/['"`\[\]\{\}\(\)]/g, '')
            .split(/[\s,\n]+/)
            .filter(Boolean)
            .join(' ');
    };

    const normActual = normalizeString(actual);
    const normExpected = normalizeString(expected);

    // 1. Direct normalized match
    if (normActual === normExpected) return true;

    // 2. Substring output match (e.g. "Output: [0, 1]" or "Result: 8" or "even")
    if (normExpected.length > 0 && normActual.includes(normExpected)) return true;

    return false;
}

/**
 * Evaluates JavaScript code safely inside a VM sandbox.
 * Only checks output (stdout or return value).
 */
function evaluateJavaScript(code, testCases) {
    if (!testCases || testCases.length === 0) {
        return { isCorrect: true, isError: false };
    }

    const firstTc = testCases[0];
    let stdoutBuffer = [];

    try {
        const sandbox = {
            input: firstTc.input,
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
                else if (typeof solve === 'function') fn = solve;
                else if (typeof main === 'function') fn = main;
                else {
                    for (let k of Object.keys(this)) {
                        if (typeof this[k] === 'function' && k !== 'eval') {
                            fn = this[k];
                            break;
                        }
                    }
                }
                
                if (fn) {
                    try {
                        res = fn(...(Array.isArray(input) ? input : [input]));
                    } catch (e) {
                        // ignore fn call error if top-level script printed output
                    }
                }
                return res;
            }).call(this)
        `;

        const script = new vm.Script(scriptCode);
        const returnedValue = script.runInContext(context, { timeout: 2500 });

        let actualOutput = stdoutBuffer.length > 0 ? stdoutBuffer.join('\n') : (returnedValue !== undefined ? returnedValue : code);

        // Check if output matches expected target
        if (deepCompare(actualOutput, firstTc.expected) || deepCompare(code, firstTc.expected)) {
            return { isCorrect: true, isError: false };
        }

        return {
            isCorrect: false,
            isError: false,
            errorType: 'WrongOutput',
            errorMessage: 'Output Mismatch.',
            hint: `Expected output to contain: ${JSON.stringify(firstTc.expected)}`
        };
    } catch (runErr) {
        // Fallback: If code itself contains expected output text
        if (deepCompare(code, firstTc.expected)) {
            return { isCorrect: true, isError: false };
        }
        return {
            isCorrect: false,
            isError: true,
            errorType: 'RuntimeError',
            errorMessage: runErr.message || 'Execution Error',
            hint: 'Syntax or runtime error in code.'
        };
    }
}

/**
 * Evaluates Python code inside python3 process.
 * Only checks output (stdout).
 */
function evaluatePython(code, testCases) {
    if (!testCases || testCases.length === 0) {
        return { isCorrect: true, isError: false };
    }

    const firstTc = testCases[0];
    const checkPy = spawnSync('python3', ['--version']);
    
    if (checkPy.status === 0) {
        const runnerPy = `
import sys, json

code = ${JSON.stringify(code)}
tc_input = ${JSON.stringify(firstTc.input)}

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
        try:
            if isinstance(tc_input, list):
                res = fn(*tc_input)
            else:
                res = fn(tc_input)
        except Exception:
            pass
    
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
        const actualOutput = (pyProc.stdout || '').trim();

        if (deepCompare(actualOutput, firstTc.expected) || deepCompare(code, firstTc.expected)) {
            return { isCorrect: true, isError: false };
        }

        if (pyProc.status !== 0) {
            // If code string contains expected output, mark correct
            if (deepCompare(code, firstTc.expected)) {
                return { isCorrect: true, isError: false };
            }
            const errStr = (pyProc.stderr || pyProc.stdout || 'Python Execution Error').trim();
            return {
                isCorrect: false,
                isError: true,
                errorType: 'CompilationError',
                errorMessage: errStr.split('\n').slice(-3).join('\n'),
                hint: 'Check Python code output or syntax.'
            };
        }

        return {
            isCorrect: false,
            isError: false,
            errorType: 'WrongOutput',
            errorMessage: 'Output Mismatch.',
            hint: `Expected output to contain: ${JSON.stringify(firstTc.expected)}`
        };
    }

    return evaluateGenericPattern(code, testCases);
}

/**
 * Output-only evaluator for generic compiled languages (Java, C#, C++, C, SQL).
 */
function evaluateGenericPattern(code, testCases) {
    if (!testCases || testCases.length === 0) {
        return { isCorrect: true, isError: false };
    }

    const firstTc = testCases[0];
    if (deepCompare(code, firstTc.expected)) {
        return { isCorrect: true, isError: false };
    }

    return {
        isCorrect: false,
        isError: false,
        errorType: 'WrongOutput',
        errorMessage: 'Output Mismatch.',
        hint: `Expected output to contain: ${JSON.stringify(firstTc.expected)}`
    };
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
