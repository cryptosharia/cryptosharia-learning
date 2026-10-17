/** Wire contracts verified against local Package 2 schemas. Dates arrive as ISO strings. */
export type ContentDto = {
	id: string;
	kind: 'subject' | 'level' | 'chapter' | 'lesson';
	parentId: string;
	subjectId: string;
	level: number;
	chapterNumber: number;
	order: number;
	scopeId?: string | null;
	title: string;
	description?: string | null;
	thumbnail?: string | null;
	durationSeconds?: number | null;
	instructor?: string | null;
	status: 'published';
	version: number;
	publishedAt?: string | null;
};
export type GrantDto = {
	userId: string;
	scopeId: string;
	state: 'active' | 'revoked';
	startsAt: string;
	expiresAt: string;
};
export type ProgressDto = {
	userId: string;
	lessonId: string;
	version: number;
	positionSeconds: number;
	updatedAt: string;
};
export type CompletionDto = {
	userId: string;
	lessonId: string;
	version: number;
	completedAt: string;
};
export type SummaryDto = { completed: number; total: number; percentage: number };
export type CompletionsDto = { completions: CompletionDto[]; summary: SummaryDto };
export type MediaDto = {
	videoId: string;
	version: number;
	readingRefs: string[];
	slideRefs: string[];
	subtitleRefs: string[];
	attachmentRefs: string[];
};
export type LessonDto = { lesson: ContentDto; media: MediaDto };

// ==========================================
// Package 4 Admin CMS DTOs
// ==========================================

export type ScopeDto = {
	id: string;
	name: string;
	description: string;
	isActive: boolean;
	createdAt?: string;
	updatedAt?: string;
};

export type AdminContentDto = {
	id: string;
	kind: 'subject' | 'level' | 'chapter' | 'lesson';
	parentId: string;
	subjectId: string;
	level: number;
	chapterNumber: number;
	order: number;
	scopeId?: string | null;
	title: string;
	description?: string;
	thumbnail?: string;
	durationSeconds: number;
	instructor?: string;
	status: 'draft' | 'review' | 'approved' | 'published' | 'archived';
	version: number;
	syariahRequired: boolean;
	reviewedBy?: string | null;
	syariahReviewedBy?: string | null;
	rightsConfirmed: boolean;
	approvedAt?: string | null;
	publishedAt?: string | null;
	createdAt?: string;
	updatedAt?: string;
};

export type AdminStatsDto = {
	totalLessons: number;
	publishedLessons: number;
	draftContent: number;
	reviewContent: number;
	totalScopes: number;
	totalGrants: number;
};

export type AdminGrantDto = {
	id: string;
	userId: string;
	scopeId: string;
	state: 'active' | 'revoked';
	startsAt: string;
	expiresAt: string;
	source: string;
	auditId?: string | null;
	createdAt: string;
};

