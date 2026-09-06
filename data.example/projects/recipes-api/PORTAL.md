A small API behind recipes.example.com: recipe CRUD, search, and the public
read endpoints your site calls. Runs on our cloud box with a nightly encrypted
database backup.

Where things stand: the build is live and stable. The current piece of work is
full-text search across recipe titles and ingredients — the database side is in,
the `?q=` parameter on the list endpoint is being wired now. After that we'll add
rate-limiting to the public endpoints before we point more traffic at them.
