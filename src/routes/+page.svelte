<script lang="ts">
	import * as env from '$env/static/public';
	import { academyTestEnabled } from '$lib/academyAccess';
	import { isApiMode } from '$lib/academyConfig';
	import { resolveAcademyFirebaseSettings } from '$lib/firebaseConfig';
	import AcademyCatalog from '$lib/components/AcademyCatalog.svelte';
	import AcademyUnavailable from '$lib/components/AcademyUnavailable.svelte';
	const environment: Record<string, string | undefined> = env;
	const enabled =
		isApiMode(environment) ||
		academyTestEnabled(environment.PUBLIC_ACADEMY_ENABLED, resolveAcademyFirebaseSettings(env));
</script>

{#if enabled}<AcademyCatalog />{:else}<AcademyUnavailable />{/if}
