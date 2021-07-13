# concept-scheme-restriction-generator
Generator to render a complete `ConceptScheme` from a `ConceptSchemeRestriction`.

This GitHub Action generates an `index.md` file and `activity-list.jsonld` file from a file containing a `ConceptSchemeRestriction` within a `ConceptScheme`.

For more information about `ConceptSchemeRestriction`, see the [associated proposal in GitHub](https://github.com/openactive/modelling-opportunity-data/issues/124).

## Usage

Create a new GitHub Action using the following template, in a repository that includes a `restriction.jsonld` file in the root.

```yml
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - master

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Render Documentation
        uses: openactive/concept-scheme-restriction-generator@master
        with:
          schemeFile: restriction.jsonld
      - name: Deploy
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./output
          force_orphan: true
          enable_jekyll: true
```

You may customise the parameter:

- `schemeFile` - JSON-LD file containing a `ConceptSchemeRestriction` within a `ConceptScheme`.
