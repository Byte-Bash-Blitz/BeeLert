const db = require('./db');

const INITIAL_QUESTIONS = [
    // Easy Questions
    {
        id: 'q_sum_two',
        title: 'Sum of Two Numbers',
        difficulty: 'Easy',
        category: 'Variables',
        description: 'Given two numbers `a` and `b`, output their sum.\n\n**Input Format:** Two integers or array of two integers `[a, b]`\n**Expected Output:** `a + b`',
        hint: 'Use the `+` operator to add `a` and `b`.',
        testCases: [
            { input: [3, 5], expected: 8 },
            { input: [-2, 10], expected: 8 },
            { input: [0, 0], expected: 0 }
        ],
        solutionCode: {
            python: `def solve(a, b):\n    return a + b\n\nprint(solve(3, 5)) # Output: 8`,
            javascript: `function solve(a, b) {\n    return a + b;\n}\nconsole.log(solve(3, 5)); // Output: 8`
        }
    },
    {
        id: 'q_even_odd',
        title: 'Even or Odd',
        difficulty: 'Easy',
        category: 'Conditions',
        description: 'Write a function or program that checks if a number `n` is Even or Odd.\n\n**Input:** Integer `n`\n**Output:** `"Even"` or `"Odd"`',
        hint: 'Use the modulo operator `% 2`.',
        testCases: [
            { input: [4], expected: 'Even' },
            { input: [7], expected: 'Odd' },
            { input: [0], expected: 'Even' }
        ],
        solutionCode: {
            python: `def solve(n):\n    return "Even" if n % 2 == 0 else "Odd"\n\nprint(solve(4)) # Output: Even`,
            javascript: `function solve(n) {\n    return n % 2 === 0 ? "Even" : "Odd";\n}\nconsole.log(solve(4)); // Output: Even`
        }
    },
    {
        id: 'q_reverse_string',
        title: 'Reverse String',
        difficulty: 'Easy',
        category: 'Strings',
        description: 'Write a function that reverses a given string `str`.\n\n**Input:** String `"hello"`\n**Output:** `"olleh"`',
        hint: 'You can iterate backwards or use built-in string reverse methods.',
        testCases: [
            { input: ['hello'], expected: 'olleh' },
            { input: ['Python'], expected: 'nohtyP' },
            { input: ['a'], expected: 'a' }
        ],
        solutionCode: {
            python: `def solve(s):\n    return s[::-1]\n\nprint(solve("hello")) # Output: olleh`,
            javascript: `function solve(s) {\n    return s.split('').reverse().join('');\n}\nconsole.log(solve("hello")); // Output: olleh`
        }
    },
    {
        id: 'q_find_max_array',
        title: 'Find Maximum in Array',
        difficulty: 'Easy',
        category: 'Arrays',
        description: 'Find the largest integer in an array `arr`.\n\n**Input:** Array of integers e.g. `[1, 9, 3, 5]`\n**Output:** Maximum number e.g. `9`',
        hint: 'Initialize max with the first element and iterate through the array.',
        testCases: [
            { input: [[1, 9, 3, 5]], expected: 9 },
            { input: [[-10, -3, -50]], expected: -3 },
            { input: [[42]], expected: 42 }
        ],
        solutionCode: {
            python: `def solve(arr):\n    return max(arr)\n\nprint(solve([1, 9, 3, 5])) # Output: 9`,
            javascript: `function solve(arr) {\n    return Math.max(...arr);\n}\nconsole.log(solve([1, 9, 3, 5])); // Output: 9`
        }
    },
    {
        id: 'q_count_vowels',
        title: 'Count Vowels',
        difficulty: 'Easy',
        category: 'Strings',
        description: 'Count the number of vowels (a, e, i, o, u case-insensitive) in a string `str`.\n\n**Input:** `"Programming"`\n**Output:** `3`',
        hint: 'Convert string to lowercase and check if each char is in "aeiou".',
        testCases: [
            { input: ['Programming'], expected: 3 },
            { input: ['AEIOU'], expected: 5 },
            { input: ['xyz'], expected: 0 }
        ],
        solutionCode: {
            python: `def solve(s):\n    vowels = "aeiouAEIOU"\n    return sum(1 for char in s if char in vowels)\n\nprint(solve("Programming")) # Output: 3`,
            javascript: `function solve(s) {\n    return (s.match(/[aeiou]/gi) || []).length;\n}\nconsole.log(solve("Programming")); // Output: 3`
        }
    },
    {
        id: 'q_factorial',
        title: 'Factorial of N',
        difficulty: 'Easy',
        category: 'Loops',
        description: 'Compute `n!` (n factorial) for a given non-negative integer `n`.\n\n**Input:** Integer `n` (e.g. `5`)\n**Output:** `120`',
        hint: 'Use a loop or recursive multiplication from 1 to n.',
        testCases: [
            { input: [5], expected: 120 },
            { input: [0], expected: 1 },
            { input: [1], expected: 1 }
        ],
        solutionCode: {
            python: `def solve(n):\n    res = 1\n    for i in range(1, n + 1):\n        res *= i\n    return res\n\nprint(solve(5)) # Output: 120`,
            javascript: `function solve(n) {\n    let res = 1;\n    for (let i = 1; i <= n; i++) res *= i;\n    return res;\n}\nconsole.log(solve(5)); // Output: 120`
        }
    },

    // Medium Questions
    {
        id: 'q_palindrome_check',
        title: 'Valid Palindrome',
        difficulty: 'Medium',
        category: 'Strings',
        description: 'Check if a string is a palindrome ignoring non-alphanumeric characters and case.\n\n**Input:** `"A man, a plan, a canal: Panama"`\n**Output:** `true`',
        hint: 'Clean the string by removing spaces and punctuation, then check if it equals its reverse.',
        testCases: [
            { input: ['A man, a plan, a canal: Panama'], expected: true },
            { input: ['race a car'], expected: false },
            { input: ['No lemon, no melon'], expected: true }
        ],
        solutionCode: {
            python: `import re\ndef solve(s):\n    clean = re.sub(r'[^a-zA-Z0-9]', '', s).lower()\n    return clean == clean[::-1]\n\nprint(solve("A man, a plan, a canal: Panama")) # Output: True`,
            javascript: `function solve(s) {\n    const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');\n    return clean === clean.split('').reverse().join('');\n}\nconsole.log(solve("A man, a plan, a canal: Panama")); // Output: true`
        }
    },
    {
        id: 'q_fibonacci_nth',
        title: 'N-th Fibonacci Number',
        difficulty: 'Medium',
        category: 'Recursion',
        description: 'Calculate the N-th Fibonacci number where `fib(0)=0` and `fib(1)=1`.\n\n**Input:** `n = 7`\n**Output:** `13`',
        hint: 'Use iteration or memoization for efficiency.',
        testCases: [
            { input: [0], expected: 0 },
            { input: [1], expected: 1 },
            { input: [7], expected: 13 },
            { input: [10], expected: 55 }
        ],
        solutionCode: {
            python: `def solve(n):\n    if n <= 1: return n\n    a, b = 0, 1\n    for _ in range(2, n + 1):\n        a, b = b, a + b\n    return b\n\nprint(solve(7)) # Output: 13`,
            javascript: `function solve(n) {\n    if (n <= 1) return n;\n    let a = 0, b = 1;\n    for (let i = 2; i <= n; i++) {\n        [a, b] = [b, a + b];\n    }\n    return b;\n}\nconsole.log(solve(7)); // Output: 13`
        }
    },
    {
        id: 'q_binary_search',
        title: 'Binary Search',
        difficulty: 'Medium',
        category: 'Searching',
        description: 'Given a sorted array `arr` and a target `target`, return the 0-based index of target. If not found, return `-1`.\n\n**Input:** `arr = [1, 3, 5, 7, 9], target = 7`\n**Output:** `3`',
        hint: 'Divide the search space in half using two pointers `left` and `right`.',
        testCases: [
            { input: [[1, 3, 5, 7, 9], 7], expected: 3 },
            { input: [[1, 3, 5, 7, 9], 2], expected: -1 },
            { input: [[10, 20, 30], 10], expected: 0 }
        ],
        solutionCode: {
            python: `def solve(arr, target):\n    l, r = 0, len(arr) - 1\n    while l <= r:\n        mid = (l + r) // 2\n        if arr[mid] == target: return mid\n        elif arr[mid] < target: l = mid + 1\n        else: r = mid - 1\n    return -1\n\nprint(solve([1, 3, 5, 7, 9], 7)) # Output: 3`,
            javascript: `function solve(arr, target) {\n    let l = 0, r = arr.length - 1;\n    while (l <= r) {\n        let mid = Math.floor((l + r) / 2);\n        if (arr[mid] === target) return mid;\n        else if (arr[mid] < target) l = mid + 1;\n        else r = mid - 1;\n    }\n    return -1;\n}\nconsole.log(solve([1, 3, 5, 7, 9], 7)); // Output: 3`
        }
    },
    {
        id: 'q_two_sum',
        title: 'Two Sum Problem',
        difficulty: 'Medium',
        category: 'Algorithms',
        description: 'Given an array of numbers `nums` and a `target`, return indices of the two numbers such that they add up to `target`.\n\n**Input:** `nums = [2, 7, 11, 15], target = 9`\n**Output:** `[0, 1]`',
        hint: 'Use a hash map to store complement `target - num` and its index.',
        testCases: [
            { input: [[2, 7, 11, 15], 9], expected: [0, 1] },
            { input: [[3, 2, 4], 6], expected: [1, 2] },
            { input: [[3, 3], 6], expected: [0, 1] }
        ],
        solutionCode: {
            python: `def solve(nums, target):\n    seen = {}\n    for i, num in enumerate(nums):\n        diff = target - num\n        if diff in seen: return [seen[diff], i]\n        seen[num] = i\n\nprint(solve([2, 7, 11, 15], 9)) # Output: [0, 1]`,
            javascript: `function solve(nums, target) {\n    const map = new Map();\n    for (let i = 0; i < nums.length; i++) {\n        const diff = target - nums[i];\n        if (map.has(diff)) return [map.get(diff), i];\n        map.set(nums[i], i);\n    }\n}\nconsole.log(solve([2, 7, 11, 15], 9)); // Output: [0, 1]`
        }
    },
    {
        id: 'q_oop_bank',
        title: 'Bank Account Class',
        difficulty: 'Medium',
        category: 'OOP',
        description: 'Implement a BankAccount class/object with `balance`, `deposit(amount)`, and `withdraw(amount)` methods.\n\nDeposit increases balance, withdraw decreases balance (if sufficient funds), return updated balance.',
        hint: 'Manage `balance` state in the class or object constructor.',
        testCases: [
            { input: [100, 'deposit', 50], expected: 150 },
            { input: [100, 'withdraw', 30], expected: 70 },
            { input: [50, 'withdraw', 100], expected: 'Insufficient Funds' }
        ],
        solutionCode: {
            python: `class BankAccount:\n    def __init__(self, balance):\n        self.balance = balance\n    def deposit(self, amt):\n        self.balance += amt\n        return self.balance\n    def withdraw(self, amt):\n        if amt > self.balance: return "Insufficient Funds"\n        self.balance -= amt\n        return self.balance`,
            javascript: `class BankAccount {\n    constructor(balance) { this.balance = balance; }\n    deposit(amt) { this.balance += amt; return this.balance; }\n    withdraw(amt) {\n        if (amt > this.balance) return "Insufficient Funds";\n        this.balance -= amt;\n        return this.balance;\n    }\n}`
        }
    },
    {
        id: 'q_sql_high_salary',
        title: 'SQL Highest Salary',
        difficulty: 'Medium',
        category: 'SQL',
        description: 'Write a SQL query to select the name of the employee with the highest salary from table `employees(name, salary)`.\n\n**Expected SQL:** `SELECT name FROM employees ORDER BY salary DESC LIMIT 1;`',
        hint: 'Use ORDER BY salary DESC and LIMIT 1.',
        testCases: [
            { input: ['query'], expected: 'SELECT name FROM employees ORDER BY salary DESC LIMIT 1' }
        ],
        solutionCode: {
            python: `SELECT name FROM employees ORDER BY salary DESC LIMIT 1;`,
            javascript: `SELECT name FROM employees ORDER BY salary DESC LIMIT 1;`
        }
    },

    // Hard Questions
    {
        id: 'q_valid_parentheses',
        title: 'Valid Parentheses Stacks',
        difficulty: 'Hard',
        category: 'Data Structures',
        description: 'Given a string containing `()`, `{}`, `[]`, determine if the input string is valid.\n\n**Input:** `"({[]})"`\n**Output:** `true`',
        hint: 'Use a Stack data structure to push open brackets and pop on matching closed brackets.',
        testCases: [
            { input: ['()[]{}'], expected: true },
            { input: ['({[]})'], expected: true },
            { input: ['(]'], expected: false },
            { input: ['([)]'], expected: false }
        ],
        solutionCode: {
            python: `def solve(s):\n    stack = []\n    mapping = {')': '(', '}': '{', ']': '['}\n    for c in s:\n        if c in mapping:\n            top = stack.pop() if stack else '#'\n            if mapping[c] != top: return False\n        else: stack.append(c)\n    return not stack\n\nprint(solve("({[]})")) # Output: True`,
            javascript: `function solve(s) {\n    const stack = [];\n    const map = { ')': '(', '}': '{', ']': '[' };\n    for (let c of s) {\n        if (c in map) {\n            if (stack.pop() !== map[c]) return false;\n        } else stack.push(c);\n    }\n    return stack.length === 0;\n}\nconsole.log(solve("({[]})")); // Output: true`
        }
    },
    {
        id: 'q_merge_sort',
        title: 'Merge Sorted Arrays',
        difficulty: 'Hard',
        category: 'Sorting',
        description: 'Merge two sorted arrays `arr1` and `arr2` into one sorted array in O(n + m) time.\n\n**Input:** `arr1 = [1, 3, 5], arr2 = [2, 4, 6]`\n**Output:** `[1, 2, 3, 4, 5, 6]`',
        hint: 'Use two pointers to compare elements of both arrays.',
        testCases: [
            { input: [[1, 3, 5], [2, 4, 6]], expected: [1, 2, 3, 4, 5, 6] },
            { input: [[10, 20], [1, 2, 3]], expected: [1, 2, 3, 10, 20] },
            { input: [[], [1, 2]], expected: [1, 2] }
        ],
        solutionCode: {
            python: `def solve(arr1, arr2):\n    return sorted(arr1 + arr2)\n\nprint(solve([1, 3, 5], [2, 4, 6])) # Output: [1, 2, 3, 4, 5, 6]`,
            javascript: `function solve(arr1, arr2) {\n    return [...arr1, ...arr2].sort((a, b) => a - b);\n}\nconsole.log(solve([1, 3, 5], [2, 4, 6])); // Output: [1, 2, 3, 4, 5, 6]`
        }
    },
    {
        id: 'q_lru_cache',
        title: 'LRU Cache Design',
        difficulty: 'Hard',
        category: 'Data Structures',
        description: 'Design a Data Structure that follows Least Recently Used (LRU) eviction policy with fixed capacity.\n\nMethods: `get(key)`, `put(key, value)`. Return `-1` if key missing.',
        hint: 'Use a Hash Map combined with a Doubly Linked List.',
        testCases: [
            { input: ['lru_test'], expected: 'Passed' }
        ],
        solutionCode: {
            python: `from collections import OrderedDict\nclass LRUCache:\n    def __init__(self, capacity):\n        self.cache = OrderedDict()\n        self.cap = capacity\n    def get(self, key):\n        if key not in self.cache: return -1\n        self.cache.move_to_end(key)\n        return self.cache[key]\n    def put(self, key, value):\n        if key in self.cache: self.cache.move_to_end(key)\n        self.cache[key] = value\n        if len(self.cache) > self.cap: self.cache.popitem(last=False)`,
            javascript: `class LRUCache {\n    constructor(capacity) {\n        this.cap = capacity;\n        this.map = new Map();\n    }\n    get(key) {\n        if (!this.map.has(key)) return -1;\n        const val = this.map.get(key);\n        this.map.delete(key);\n        this.map.set(key, val);\n        return val;\n    }\n    put(key, val) {\n        if (this.map.has(key)) this.map.delete(key);\n        this.map.set(key, val);\n        if (this.map.size > this.cap) {\n            this.map.delete(this.map.keys().next().value);\n        }\n    }\n}`
        }
    }
];

function initQuestionBank() {
    let bank = db.getQuestionBank();
    if (!bank || bank.length === 0) {
        db.saveQuestionBank(INITIAL_QUESTIONS);
        console.log('✅ [Programming Challenge] Initialized question bank with default challenges.');
        return INITIAL_QUESTIONS;
    }
    return bank;
}

function getAllQuestions() {
    const bank = db.getQuestionBank();
    return (bank && bank.length > 0) ? bank : INITIAL_QUESTIONS;
}

function getRandomQuestion(excludeIds = []) {
    const all = getAllQuestions();
    const available = all.filter(q => !excludeIds.includes(q.id));
    if (available.length === 0) {
        return all[Math.floor(Math.random() * all.length)];
    }
    return available[Math.floor(Math.random() * available.length)];
}

function addQuestion(newQuestion) {
    const all = getAllQuestions();
    all.push(newQuestion);
    db.saveQuestionBank(all);
    return newQuestion;
}

function deleteQuestion(id) {
    let all = getAllQuestions();
    const lenBefore = all.length;
    all = all.filter(q => q.id !== id);
    db.saveQuestionBank(all);
    return all.length < lenBefore;
}

function getSolutionForQuestion(question) {
    if (!question) return null;
    if (question.solutionCode && question.solutionCode.python && !question.solutionCode.python.includes('pass')) {
        return question.solutionCode;
    }
    const initQ = INITIAL_QUESTIONS.find(q => q.id === question.id || q.title === question.title);
    if (initQ && initQ.solutionCode) {
        return initQ.solutionCode;
    }
    return {
        python: `# Solution for ${question.title}\n# Category: ${question.category}\n\ndef solve():\n    # Hint: ${question.hint || question.description}\n    pass`,
        javascript: `// Solution for ${question.title}\n// Category: ${question.category}\n\nfunction solve() {\n    // Hint: ${question.hint || question.description}\n}`
    };
}

module.exports = {
    INITIAL_QUESTIONS,
    initQuestionBank,
    getAllQuestions,
    getRandomQuestion,
    getSolutionForQuestion,
    addQuestion,
    deleteQuestion
};
