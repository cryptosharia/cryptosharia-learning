#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACADEMY_SUBJECTS = new Set(['fundamental', 'technical', 'muamalah', 'web3']);

const aliases = {
	lesson_id: ['lesson_id', 'id'],
	subject: ['subject', 'subjectId'],
	level: ['level'],
	chapter: ['chapter', 'chapterNumber'],
	lesson_order: ['lesson_order', 'order'],
	parent_id: ['parent_id', 'parentId'],
	title: ['title'],
	description: ['description'],
	youtube_url_or_id: ['youtube_url_or_id', 'youtubeUrlOrId', 'videoId'],
	duration_seconds: ['duration_seconds', 'durationSeconds'],
	visibility: ['visibility'],
	publication_status: ['publication_status', 'publicationStatus'],
	version: ['version'],
	scope: ['scope', 'scopeId'],
	editorial_status: ['editorial_status', 'editorialStatus'],
	approval_status: ['approval_status', 'approvalStatus'],
	rights_status: ['rights_status', 'rightsStatus'],
	syariah_review_status: ['syariah_review_status', 'syariahReviewStatus']
};

const required = [
	'lesson_id',
	'subject',
	'level',
	'chapter',
	'lesson_order',
	'parent_id',
	'title',
	'youtube_url_or_id',
	'duration_seconds',
	'visibility',
	'publication_status',
	'version',
	'scope'
];

const workflowValues = {
	editorial_status: new Set(['draft', 'in_review', 'approved', 'rejected']),
	approval_status: new Set(['pending', 'approved', 'rejected']),
	rights_status: new Set(['pending', 'confirmed', 'rejected']),
	syariah_review_status: new Set(['pending', 'in_review', 'approved', 'rejected'])
};

function splitCsv(text) {
	const rows = [];
	let row = [];
	let value = '';
	let quoted = false;
	let rowNumber = 1;
	for (let i = 0; i < text.length; i += 1) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				value += '"';
				i += 1;
			} else if (char === '"') {
				quoted = false;
			} else if (char === '\r' || char === '\n') {
				value += '\n';
				if (char === '\r' && text[i + 1] === '\n') i += 1;
				rowNumber += 1;
			} else {
				value += char;
			}
			continue;
		}
		if (char === '"') {
			if (value.length) throw new Error(`CSV line ${rowNumber}: quote inside an unquoted value.`);
			quoted = true;
		} else if (char === ',') {
			row.push(value);
			value = '';
		} else if (char === '\n' || char === '\r') {
			if (char === '\r' && text[i + 1] === '\n') i += 1;
			row.push(value);
			rows.push({ cells: row, rowNumber });
			row = [];
			value = '';
			rowNumber += 1;
		} else {
			value += char;
		}
	}
	if (quoted) throw new Error(`CSV line ${rowNumber}: unterminated quoted value.`);
	if (value.length || row.length) {
		row.push(value);
		rows.push({ cells: row, rowNumber });
	}
	return rows;
}

function parseCsv(text) {
	const records = splitCsv(text.replace(/^\uFEFF/, '')).filter(({ cells }) =>
		cells.some((cell) => cell.trim() !== '')
	);
	if (records.length === 0) throw new Error('CSV manifest is empty.');
	const headers = records[0].cells.map((header) => header.trim());
	const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
	if (duplicates.length)
		throw new Error(`CSV has duplicate column(s): ${[...new Set(duplicates)].join(', ')}.`);
	const missing = required.filter((header) => !headers.includes(header));
	if (missing.length) throw new Error(`CSV is missing required column(s): ${missing.join(', ')}.`);
	return records.slice(1).map(({ cells, rowNumber }) => {
		if (cells.length > headers.length)
			throw new Error(`CSV line ${rowNumber}: more values than columns.`);
		return {
			_sourceRow: rowNumber,
			...Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
		};
	});
}

export function parseManifestText(text, format) {
	const kind = format?.toLowerCase();
	if (kind === '.csv' || kind === 'csv') return parseCsv(text);
	if (kind === '.json' || kind === 'json') {
		let parsed;
		try {
			parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
		} catch {
			throw new Error('JSON manifest is not valid JSON.');
		}
		const rows = Array.isArray(parsed) ? parsed : (parsed?.lessons ?? parsed?.items);
		if (!Array.isArray(rows))
			throw new Error('JSON manifest must be an array or contain a lessons/items array.');
		return rows.map((row, index) => {
			if (!row || typeof row !== 'object' || Array.isArray(row)) {
				throw new Error(`JSON lesson row ${index + 1} must be an object.`);
			}
			return { _sourceRow: index + 1, ...row };
		});
	}
	throw new Error('Manifest must use a .csv or .json extension.');
}

export function parseCurriculumReference(value) {
	const items = Array.isArray(value) ? value : (value?.items ?? value?.curriculum);
	if (!Array.isArray(items)) {
		throw new Error('Curriculum reference must be an array or contain an items/curriculum array.');
	}
	return items;
}

export function parseYouTubeVideoId(input) {
	const value = String(input ?? '').trim();
	if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
	let url;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
		return null;
	const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
	const embedHosts = new Set([...youtubeHosts, 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
	let id;
	if (url.hostname === 'youtu.be') {
		id = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/)?.[1];
	} else if (youtubeHosts.has(url.hostname) && url.pathname === '/watch') {
		const values = url.searchParams.getAll('v');
		if (values.length === 1) id = values[0];
	} else if (embedHosts.has(url.hostname)) {
		const paths = youtubeHosts.has(url.hostname) ? '(?:embed|shorts)' : 'embed';
		id = url.pathname.match(new RegExp(`^/${paths}/([A-Za-z0-9_-]{11})$`))?.[1];
	}
	return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function pick(row, field) {
	for (const alias of aliases[field]) {
		if (row?.[alias] !== undefined) return row[alias];
	}
	return '';
}

function integer(value, field, rowNumber, errors, { min, max }) {
	const parsed = typeof value === 'number' ? value : Number(String(value).trim());
	if (!Number.isInteger(parsed) || parsed < min || (max !== undefined && parsed > max)) {
		const range = max === undefined ? `at least ${min}` : `between ${min} and ${max}`;
		errors.push({ row: rowNumber, field, message: `Must be an integer ${range}.` });
		return null;
	}
	return parsed;
}

function findItem(items, predicate) {
	return items.find(predicate);
}

export function validateManifest(rows, { curriculumItems } = {}) {
	const errors = [];
	const warnings = [];
	const candidates = [];
	const seenIds = new Map();
	const seenOrders = new Map();
	const reference = Array.isArray(curriculumItems) ? curriculumItems : null;
	if (!reference)
		warnings.push(
			'No local curriculum reference supplied; parent existence and existing order collisions are unverified.'
		);
	if (!Array.isArray(rows) || rows.length === 0) {
		return {
			valid: false,
			reconciled: false,
			readyForOwnerReview: false,
			databaseWrites: false,
			videoFetched: false,
			published: false,
			candidates,
			errors: [{ row: 0, field: 'manifest', message: 'Manifest contains no lesson rows.' }],
			warnings
		};
	}

	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index] ?? {};
		const rowNumber = Number.isInteger(row._sourceRow) ? row._sourceRow : index + 1;
		const value = Object.fromEntries(
			Object.keys(aliases).map((field) => [field, String(pick(row, field) ?? '').trim()])
		);
		const before = errors.length;
		for (const field of required) {
			if (!value[field])
				errors.push({ row: rowNumber, field, message: 'Required value is missing.' });
		}
		if (!value.lesson_id || value.lesson_id.length > 128 || /\s/.test(value.lesson_id)) {
			errors.push({
				row: rowNumber,
				field: 'lesson_id',
				message: 'Must be a non-empty ID up to 128 characters with no whitespace.'
			});
		}
		if (value.lesson_id) {
			const priorRow = seenIds.get(value.lesson_id);
			if (priorRow !== undefined) {
				errors.push({
					row: rowNumber,
					field: 'lesson_id',
					message: `Duplicate lesson ID also appears on row ${priorRow}.`
				});
			} else seenIds.set(value.lesson_id, rowNumber);
		}
		if (!ACADEMY_SUBJECTS.has(value.subject)) {
			errors.push({
				row: rowNumber,
				field: 'subject',
				message: `Unknown Academy subject "${value.subject}". Allowed: ${[...ACADEMY_SUBJECTS].join(', ')}.`
			});
		}
		const level = integer(value.level, 'level', rowNumber, errors, { min: 1, max: 6 });
		const chapter = integer(value.chapter, 'chapter', rowNumber, errors, { min: 1, max: 7 });
		const order = integer(value.lesson_order, 'lesson_order', rowNumber, errors, { min: 0 });
		const durationSeconds = integer(value.duration_seconds, 'duration_seconds', rowNumber, errors, {
			min: 1,
			max: 28800
		});
		const version = integer(value.version, 'version', rowNumber, errors, { min: 1 });
		if (!value.parent_id || value.parent_id.length > 128 || /\s/.test(value.parent_id)) {
			errors.push({
				row: rowNumber,
				field: 'parent_id',
				message: 'Must name an existing chapter ID; whitespace is not allowed.'
			});
		}
		if (!value.title || value.title.length > 200) {
			errors.push({
				row: rowNumber,
				field: 'title',
				message: 'Title is required and must be at most 200 characters.'
			});
		}
		if (value.description.length > 5000) {
			errors.push({
				row: rowNumber,
				field: 'description',
				message: 'Description must be at most 5000 characters.'
			});
		}
		const videoId = parseYouTubeVideoId(value.youtube_url_or_id);
		if (!videoId)
			errors.push({
				row: rowNumber,
				field: 'youtube_url_or_id',
				message:
					'Use an 11-character YouTube ID or an HTTPS YouTube watch, youtu.be, shorts, or embed URL.'
			});
		if (value.visibility !== 'private')
			errors.push({
				row: rowNumber,
				field: 'visibility',
				message: 'Local preparation accepts private visibility only.'
			});
		if (value.publication_status !== 'draft')
			errors.push({
				row: rowNumber,
				field: 'publication_status',
				message:
					'Local preview accepts draft only; review and publication require the approved workflow.'
			});
		if (value.scope.length > 128 || /\s/.test(value.scope))
			errors.push({
				row: rowNumber,
				field: 'scope',
				message: 'Scope must be a non-empty ID up to 128 characters with no whitespace.'
			});
		for (const [field, allowed] of Object.entries(workflowValues)) {
			if (!value[field]) value[field] = field === 'editorial_status' ? 'draft' : 'pending';
			if (!allowed.has(value[field])) {
				errors.push({
					row: rowNumber,
					field,
					message: `Allowed values: ${[...allowed].join(', ')}.`
				});
			}
		}

		const orderKey = `${value.parent_id}\u0000${value.lesson_order}`;
		if (order !== null) {
			const priorRow = seenOrders.get(orderKey);
			if (priorRow !== undefined)
				errors.push({
					row: rowNumber,
					field: 'lesson_order',
					message: `Order ${order} is already used by another manifest row (${priorRow}) under parent "${value.parent_id}".`
				});
			else seenOrders.set(orderKey, rowNumber);
		}

		let subjectItem;
		let levelItem;
		let chapterItem;
		if (reference) {
			subjectItem = findItem(
				reference,
				(item) =>
					item.kind === 'subject' &&
					item.id === value.subject &&
					item.subjectId === value.subject &&
					item.parentId === 'root'
			);
			if (!subjectItem)
				errors.push({
					row: rowNumber,
					field: 'subject',
					message: `Subject "${value.subject}" does not exist in the supplied Academy curriculum reference.`
				});
			levelItem = findItem(
				reference,
				(item) =>
					item.kind === 'level' &&
					item.subjectId === value.subject &&
					item.level === level &&
					item.parentId === subjectItem?.id
			);
			if (subjectItem && !levelItem)
				errors.push({
					row: rowNumber,
					field: 'level',
					message: `Level ${value.level} does not exist under subject "${value.subject}" in the supplied curriculum reference.`
				});
			chapterItem = findItem(
				reference,
				(item) =>
					item.kind === 'chapter' &&
					item.subjectId === value.subject &&
					item.level === level &&
					item.chapterNumber === chapter &&
					item.parentId === levelItem?.id
			);
			if (levelItem && !chapterItem)
				errors.push({
					row: rowNumber,
					field: 'chapter',
					message: `Chapter ${value.chapter} does not exist under level ${value.level} in the supplied curriculum reference.`
				});
			const parentItem = reference.find((item) => item.id === value.parent_id);
			if (!parentItem || parentItem.kind !== 'chapter')
				errors.push({
					row: rowNumber,
					field: 'parent_id',
					message: `Parent "${value.parent_id}" does not reference an existing chapter in the supplied curriculum reference.`
				});
			if (chapterItem && chapterItem.id !== value.parent_id)
				errors.push({
					row: rowNumber,
					field: 'parent_id',
					message: `Parent "${value.parent_id}" is not the referenced chapter; expected "${chapterItem.id}".`
				});
			if (chapterItem && (chapterItem.scopeId ?? '') !== value.scope)
				errors.push({
					row: rowNumber,
					field: 'scope',
					message: `Scope "${value.scope}" does not match parent chapter scope "${chapterItem.scopeId ?? ''}".`
				});
			const duplicateInReference = reference.find((item) => item.id === value.lesson_id);
			if (duplicateInReference)
				errors.push({
					row: rowNumber,
					field: 'lesson_id',
					message: `ID already exists in the curriculum reference as ${duplicateInReference.kind}.`
				});
			if (chapterItem && order !== null) {
				const conflict = reference.find(
					(item) =>
						item.kind === 'lesson' && item.parentId === chapterItem.id && item.order === order
				);
				if (conflict)
					errors.push({
						row: rowNumber,
						field: 'lesson_order',
						message: `Order ${order} is already used by existing lesson "${conflict.id}" under chapter "${chapterItem.id}".`
					});
			}
		}

		if (
			errors.length === before &&
			level !== null &&
			chapter !== null &&
			order !== null &&
			durationSeconds !== null &&
			version !== null &&
			videoId
		) {
			candidates.push({
				sourceRow: rowNumber,
				content: {
					id: value.lesson_id,
					kind: 'lesson',
					parentId: value.parent_id,
					subjectId: value.subject,
					level,
					chapterNumber: chapter,
					order,
					title: value.title,
					description: value.description || null,
					durationSeconds,
					scopeId: value.scope,
					status: 'draft',
					version
				},
				mediaPreview: { videoId, version },
				planningMetadata: { visibility: value.visibility },
				workflow: {
					editorialStatus: value.editorial_status,
					approvalStatus: value.approval_status,
					rightsStatus: value.rights_status,
					syariahReviewStatus: value.syariah_review_status,
					claimsVerified: false
				}
			});
		}
	}

	const valid = errors.length === 0;
	const reconciled = valid && reference !== null;
	return {
		valid,
		reconciled,
		readyForOwnerReview: reconciled,
		databaseWrites: false,
		videoFetched: false,
		published: false,
		candidates,
		errors,
		warnings: [
			...warnings,
			'Workflow values are manifest assertions only; approval, rights, and syariah evidence remain unverified.',
			'Preview candidates are not official Academy content. No database or video service was contacted.'
		]
	};
}

function renderHuman(result, manifestPath, referencePath) {
	const status = !result.valid
		? 'INVALID'
		: result.reconciled
			? 'RECONCILED PREVIEW'
			: 'NEEDS CURRICULUM REFERENCE';
	const lines = [
		`Academy content preview: ${status}`,
		`Manifest: ${manifestPath}`,
		`Curriculum reference: ${referencePath || 'not supplied'}`,
		`Candidate lessons: ${result.candidates.length}`,
		'Writes: none; video fetches: none; publication: disabled.'
	];
	for (const candidate of result.candidates) {
		lines.push(
			`- ${candidate.content.id}: ${candidate.content.subjectId}/${candidate.content.level}/${candidate.content.chapterNumber} order ${candidate.content.order}; scope ${candidate.content.scopeId}; YouTube ${candidate.mediaPreview.videoId}; draft v${candidate.content.version}`
		);
	}
	for (const error of result.errors)
		lines.push(`ERROR row ${error.row} [${error.field}]: ${error.message}`);
	for (const warning of result.warnings) lines.push(`NOTE: ${warning}`);
	return lines.join('\n');
}

async function main(argv) {
	let manifestPath;
	let referencePath;
	let asJson = false;
	for (let i = 0; i < argv.length; i += 1) {
		if (argv[i] === '--curriculum-reference') {
			referencePath = argv[++i];
			if (!referencePath || referencePath.startsWith('--')) {
				throw new Error('--curriculum-reference requires a local JSON file path.');
			}
		} else if (argv[i] === '--json') asJson = true;
		else if (argv[i].startsWith('--')) throw new Error(`Unknown option: ${argv[i]}`);
		else if (!manifestPath) manifestPath = argv[i];
		else throw new Error('Provide only one manifest path.');
	}
	if (!manifestPath)
		throw new Error(
			'Usage: node scripts/academy-content-preview.mjs <manifest.csv|json> [--curriculum-reference <local.json>] [--json]'
		);
	const manifestAbsolute = resolve(manifestPath);
	const manifestText = await readFile(manifestAbsolute, 'utf8');
	const rows = parseManifestText(manifestText, extname(manifestAbsolute));
	let curriculumItems;
	if (referencePath) {
		const reference = JSON.parse(
			(await readFile(resolve(referencePath), 'utf8')).replace(/^\uFEFF/, '')
		);
		curriculumItems = parseCurriculumReference(reference);
	}
	const result = validateManifest(rows, { curriculumItems });
	if (asJson)
		process.stdout.write(
			`${JSON.stringify({ ...result, manifest: manifestAbsolute, curriculumReference: referencePath ? resolve(referencePath) : null }, null, 2)}\n`
		);
	else
		process.stdout.write(
			`${renderHuman(result, manifestAbsolute, referencePath ? resolve(referencePath) : null)}\n`
		);
	process.exitCode = result.valid ? (result.reconciled ? 0 : 2) : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main(process.argv.slice(2)).catch((error) => {
		process.stderr.write(`Academy manifest preview failed: ${error.message}\n`);
		process.exitCode = 1;
	});
}
