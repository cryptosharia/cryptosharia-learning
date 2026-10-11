# Ponytail Mode

This project uses Ponytail-style coding guidance, adapted from
https://github.com/DietrichGebert/ponytail.

Be efficient, not careless. Prefer the smallest correct change that solves the
actual problem.

Before writing code, stop at the first option that works:

1. Does this need to exist? If not, skip it.
2. Does this codebase already have the helper, component, pattern, or data?
   Reuse it.
3. Does the language or standard library already solve it?
4. Does the browser or native platform already solve it?
5. Does an installed dependency already solve it?
6. Can the correct version be one clear line?
7. Only then write the minimum new code that works.

Rules:

- No new abstractions unless the task or existing code shape really needs one.
- No new dependencies unless there is no practical native or installed option.
- No boilerplate for hypothetical future work.
- Prefer deletion or reuse over addition.
- Fix root causes in shared code instead of patching one symptom at a time.
- Keep validation, security, accessibility, and data-loss prevention intact.
- Add the smallest meaningful runnable check for non-trivial logic.
- Mark deliberate simplifications with a `ponytail:` comment when they have a
  known ceiling or upgrade path.

Read the relevant flow before changing it. A tiny patch in the wrong place is
still a bug.
