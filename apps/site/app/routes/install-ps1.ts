import { SCRIPT_URL } from "../lib/site";

// `irm <site>/install.ps1 | iex` follows this to the script in the repository.
export const loader = () => Response.redirect(SCRIPT_URL.windows, 302);
