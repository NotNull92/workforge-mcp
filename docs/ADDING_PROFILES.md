# Adding profiles

WorkForge installs one `workstation` profile. Advanced users may add another
profile later, but should preserve these invariants:

1. Store the profile at `<root>\tools\workforge-mcp\profile.json`.
2. Give every profile a unique lowercase ID. Do not add `httpPort` to new profiles; older v1 manifests may still contain it as ignored compatibility metadata.
3. Include at least one bounded identity marker inside that root.
4. Hash the exact UTF-8 profile bytes with SHA-256.
5. Add the absolute profile path and hash to `runtime\profile_registry.json`.
6. Keep registered roots distinct and non-overlapping.
7. Generate a separate tunnel profile and runtime directory.
8. Run tests and `scripts\Doctor.ps1` before connecting it in ChatGPT.

Repair and Upgrade preserve existing registry entries, but they do not create additional
profiles. A future release should add a dedicated profile-creation command before
multi-profile setup is advertised as a beginner workflow.
