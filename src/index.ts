/**
 * Composer speed window, node half. Pure UI plugin: the empty apply exists so
 * the plugin appears in the host cordis.yml / Loader; the browser half ships via
 * exports["./client"], discovered through the package.json `dsh.client`
 * declaration. The reading itself is derived in the browser from the settled
 * assistant nodes the Chat target already holds, so no Host-side behaviour and no
 * extra request is involved.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
