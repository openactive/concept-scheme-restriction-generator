var httpm = require('@actions/http-client');
var skos = require('@openactive/skos');
var fs = require('fs');

const core = require('@actions/core');

var schemeFile = core.getInput('schemeFile', { required: true });
var restrictionJson = JSON.parse(fs.readFileSync(schemeFile, { encoding:'utf8' }));

(async () => {
  var generatedScheme = await generateSchemeFromRestriction(restrictionJson);

  var dir = './output';
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir);
  }

  writeFile("output/activity-list.jsonld", JSON.stringify(generatedScheme.scheme, null, 2));
  writeFile("output/index.md", generatedScheme.markdown);
})();

function writeFile(file, string) {
  fs.writeFileSync(file, string);
  console.log("FILE SAVED: " + file);
}

function configToMarkdown(properties, config, conceptIndex) {
  var generatedMarkdownLines = [];
  properties.forEach(function(property) { 
    conceptIdList = config[property];
    if (conceptIdList) {
      generatedMarkdownLines.push("### " + property);
      conceptIdList.forEach(function(conceptId) { 
        var concept = conceptIndex[conceptId];
        generatedMarkdownLines.push('- ' + concept.prefLabel);
      });
      generatedMarkdownLines.push("");
    }
  });
  return generatedMarkdownLines.join("\n");
}

function updateNarrowerTransitive(conceptList, conceptIndex) {
  //Reset narrowerTransitive
  conceptList.forEach(function(concept) {
    concept.narrowerTransitive = [];
  });

  // Add .narrower to all broader
  conceptList.forEach(function(concept) {
    if (concept.broaderTransitive) concept.broaderTransitive.forEach(function(broaderConceptId) { 
      var broaderConcept = conceptIndex[broaderConceptId];
      broaderConcept.narrowerTransitive.push(concept.id);
    });
  });
}

function markNarrower(concept, conceptIndex) {
  concept.isIncluded = true;
  concept.narrowerTransitive.forEach(function(narrowerConceptId) { 
    var narrowerConcept = conceptIndex[narrowerConceptId];
    markNarrower(narrowerConcept, conceptIndex);
  });
}

async function generateSchemeFromRestriction(templateScheme) {
  var restriction = templateScheme["beta:conceptRestriction"];
  var generatedSchemeId = templateScheme["id"];

  var scheme = await getScheme(restriction["beta:parentScheme"]);

  // Create an index of all concepts by ID
  var conceptIndex = scheme.concept.reduce(function(map, obj) {
      map[obj.id] = obj;
      return map;
  }, {});

  // Restriction processing algorithm

  // A -> B -> C

  // 1) Setup topConceptOf and broaderTransitive using rootConcept
  //    - If B is in rootConcept then B.topConceptOf = schemeName, otherwise B.topConceptOf = null
  // 2) Add B.narrower = C
  var root = restriction["beta:rootConcept"];
  scheme.concept.forEach(function(concept) {
    if (concept.broader) {
      // Clone broader to broaderTransitive
      concept.broaderTransitive = concept.broader.slice();
    }
    if (root && root.length > 0) {
      // If rootConcept specified, then only those are roots 
      if (root.includes(concept.id)) {
        concept.topConceptOf = generatedSchemeId;
      } else {
        delete concept.topConceptOf;
      }
    } else {
      // If rootConcept not specified, then assume current original topConceptOf is still valid
      if (concept.topConceptOf === scheme.id) {
        concept.topConceptOf = generatedSchemeId;
      } else {
        delete concept.topConceptOf;
      }
    }
  });

  // Update narrowerTransitive based on broaderTransitive
  updateNarrowerTransitive(scheme.concept, conceptIndex);

  // 2) For each B that is flattened, add it's C.broaderTransitive = A and remove C.broaderTransitive == B
  //    If B was topConceptOf, C is now topConceptOf
  var flatten = restriction["beta:flattenConcept"];
  if (flatten) {
    flatten.forEach(function(flattenConceptId) {
      var flattenConcept = conceptIndex[flattenConceptId];
      flattenConcept.narrowerTransitive.forEach(function(narrowerConceptId) { 
        var narrowerConcept = conceptIndex[narrowerConceptId];
        if (flattenConcept.topConceptOf == generatedSchemeId) {
          narrowerConcept.topConceptOf = generatedSchemeId;
        }
        if (narrowerConcept.broaderTransitive) {
          narrowerConcept.broaderTransitive = narrowerConcept.broaderTransitive
            .filter(item => item != flattenConceptId)
            .concat(flattenConcept.broaderTransitive || []);
        } else throw "Tree is inconsistent";
      });
    }); 
  }
  
  // Update narrowerTransitive based on broaderTransitive
  updateNarrowerTransitive(scheme.concept, conceptIndex);

  // 3) For each B that is excluded, B.broaderTransitive = null
  var exclude = restriction["beta:excludeConcept"] || [];
  if (exclude) { 
    exclude.forEach(function(excludeConceptId) {
      var excludeConcept = conceptIndex[excludeConceptId];
      // Excluded concepts cannot be topConceptOf
      delete excludeConcept.topConceptOf;
      // This concept disowns its parents
      delete excludeConcept.broaderTransitive;
      // All children disown this concept
      excludeConcept.narrowerTransitive.forEach(function(narrowerConceptId) { 
        var narrowerConcept = conceptIndex[narrowerConceptId];
        if (narrowerConcept.broaderTransitive) {
          narrowerConcept.broaderTransitive = narrowerConcept.broaderTransitive
            .filter(item => item != excludeConceptId);
        } else throw "Tree is inconsistent";
      });
    });
  }

  // 4) If B is hidden, then B.hidden = true
  var hide = restriction["beta:hideConcept"] || [];
  if (hide) { 
    hide.forEach(function(hideConceptId) {
      var hideConcept = conceptIndex[hideConceptId];
      hideConcept.hidden = true;
    });
  }

  // Update narrowerTransitive based on broaderTransitive
  updateNarrowerTransitive(scheme.concept, conceptIndex);

  // 5) Mark nodes that are still required in the tree as .isIncluded
  scheme.concept.filter(concept => concept.topConceptOf == generatedSchemeId).forEach(function(rootConcept) {
    markNarrower(rootConcept, conceptIndex, 0);
  });
  
  // 6) Create an index and array of all concepts marked as .isIncluded
  var includedConceptArray = scheme.concept.filter(concept => concept.isIncluded);
  var includedConceptIndex = includedConceptArray.reduce(function(map, obj) {
      map[obj.id] = true;
      return map;
  }, {});

  var prunedBroader = [];
  var prunedRelated = [];

  function pruneAndDelete(concept, property) {
    var prunedConceptList = []
    if (concept[property]) prunedConceptList = concept[property].filter(id => includedConceptIndex[id] !== true).map(id => '- ' + concept.prefLabel + " -> [" + conceptIndex[id].prefLabel + "]");
    if (concept[property]) concept[property] = concept[property].filter(id => includedConceptIndex[id] === true);
    if (concept[property] && concept[property].length == 0) delete concept[property];
    return prunedConceptList;
  }

  // 7) Cleanup concepts, removing all references to any that are not .isIncluded
  includedConceptArray.forEach(function(concept) {
    // Filter out any referenced Concepts that haven't made the cut
    prunedBroader = prunedBroader.concat(pruneAndDelete(concept, 'broaderTransitive'));
    prunedRelated = prunedRelated.concat(pruneAndDelete(concept, 'related'));
    // Clean up temporary structures
    delete concept.broader;
    delete concept.narrowerTransitive;
    delete concept.isIncluded;
  });

  // Log pruning as an FYI
  console.log("Broader Concepts pruned:\n" + prunedBroader.join('\n') + '\n')
  console.log("Related Concepts pruned:\n" + prunedRelated.join('\n') + '\n')

  // 8) Validate output
  templateScheme.concept = includedConceptArray;
  var validatedScheme = new skos.ConceptScheme(templateScheme);

  // 9) Generate markdown
  var generatedMarkdownConfig = configToMarkdown(["beta:rootConcept", "beta:flattenConcept", "beta:excludeConcept", "beta:hideConcept"], restriction, conceptIndex);
  var generatedMarkdownConcepts = validatedScheme.toString();
  var generatedMarkdown = 
`# ${templateScheme.title}
${templateScheme.description}

This page contains a human readable form of the restricted [OpenActive Activity List](https://openactive.io/activity-list) scheme. It can be accessed and should be referenced via the URL [\`${templateScheme.id}\`](${templateScheme.id}).

## License
This data is derived from the [OpenActive Activity List](${scheme.id}), is owned by [${restriction.publisher.legalName}](${restriction.publisher.url}), and is licensed under the [Creative Commons Attribution Licence (CC-BY V4.0)](https://creativecommons.org/licenses/by/4.0/) for anyone to access, use and share; using attribution "${restriction.publisher.name}".

## ConceptSchemeRestriction
${generatedMarkdownConfig}

## Concepts
${generatedMarkdownConcepts}
  `;

  return {
    scheme: templateScheme,
    markdown: generatedMarkdown
  };
}

async function getScheme(schemeUrl) {
  console.log("Downloading scheme: " + schemeUrl);
  var jsonLd = await getJsonLd(schemeUrl);
  return jsonLd["concept"] && jsonLd["id"] && jsonLd["type"] === "ConceptScheme" ? jsonLd : undefined;
}

async function getJsonLd(url) {
  const additionalHeaders = {[httpm.Headers.Accept]: 'application/ld+json'}
  const client = new httpm.HttpClient();
  const jsonObj = await client.getJson(
    url,
    additionalHeaders
  );
  if (jsonObj.statusCode !== 200) throw new Error(`URL '${url}' could not be resolved`);
  return jsonObj.result;
}

module.exports = {
  generateSchemeFromRestriction
}
