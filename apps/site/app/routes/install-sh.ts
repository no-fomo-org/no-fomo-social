import { SCRIPT_URL } from "../lib/site";

// `curl -fsSL <site>/install.sh | bash` follows this to the script in the repository, so it is always the reviewed one.
export const loader = () => Response.redirect(SCRIPT_URL.mac, 302);
