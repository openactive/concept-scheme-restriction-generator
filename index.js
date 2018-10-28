
var request = require('sync-request');
var skos = require('@openactive/skos');
var fs = require('fs');

var testRestrictionMLP = {
  "@context":  [ "https://openactive.io/", "https://openactive.io/ns-beta" ],
  "type": "ConceptScheme",
  "id": "http://data.mylocalpitch.com/activity-list/activity-list.jsonld",
  "title": "My Local Pitch Restricted Activity List",
  "description": "List of activities available for MLP events",
  "beta:conceptRestriction": {
    "type": "beta:ConceptSchemeRestriction",
    "beta:parentScheme": "https://openactive.io/activity-list",
    "beta:rootConcept": [
      "https://openactive.io/activity-list#0a5f732d-e806-4e51-ad40-0a7de0239c8c"
    ],
    "beta:excludeConcept": [
      "https://openactive.io/activity-list#6016ce87-d9ed-4bd6-8cc9-5598c2f59f79",
      "https://openactive.io/activity-list#22fe3033-b0e4-4717-8455-599180b5bcba",
      "https://openactive.io/activity-list#1de4c90e-6a27-4bc4-a2be-437a443c7ded",
      "https://openactive.io/activity-list#b8019b67-2ade-406f-a012-91a5c3869652",
      "https://openactive.io/activity-list#f6301564-93d5-41ff-91a1-7ac2dd833951",
      "https://openactive.io/activity-list#666cf454-4733-4697-89cb-8e28f6e8595b"
    ],
    "beta:flattenConcept": ["https://openactive.io/activity-list#22fe3033-b0e4-4717-8455-599180b5bcba"]
  }
};

var testRestrictionEMD = {
  "@context": [ "https://openactive.io/", "https://openactive.io/ns-beta" ],
  "type": "ConceptScheme",
  "id": "https://data.emduk.org/activity-list/activity-list.jsonld",
  "title": "EMD UK Restricted Activity List",
  "description": "List of activities within scope of EMD UK",
  "beta:conceptRestriction": {
    "type": "beta:ConceptSchemeRestriction",
    "beta:parentScheme": "https://openactive.io/activity-list",
    "beta:rootConcept": [
      "https://openactive.io/activity-list#984068a7-5b7b-4989-bb33-f96953d8960c",
      "https://openactive.io/activity-list#6ca15167-51da-4d91-a1ae-8a45dc47b0ea",
      "https://openactive.io/activity-list#0141d752-088f-4bab-99fa-9a3d61ee5cf9",
      "https://openactive.io/activity-list#c16df6ed-a4a0-4275-a8c3-1c8cff56856f",
      "https://openactive.io/activity-list#1b88144e-91cf-4642-8e6a-8e4524f7c56f",
      "https://openactive.io/activity-list#11b06df1-ccf5-4176-b1be-b4c39c5377c7",
      "https://openactive.io/activity-list#6901af47-aed9-45e4-8d9f-fc71199a64df",
      "https://openactive.io/activity-list#c72e1713-25c1-4886-926a-4cd549bb4916"
    ],
    "beta:flattenConcept": [
      "https://openactive.io/activity-list#984068a7-5b7b-4989-bb33-f96953d8960c",
      "https://openactive.io/activity-list#6ca15167-51da-4d91-a1ae-8a45dc47b0ea"
    ]
  }
};

var testRestriction = {
  "type": "beta:ConceptSchemeRestriction",
  "beta:parentScheme": "https://openactive.io/activity-list",
  "beta:rootConcept": [ "https://openactive.io/activity-list#984068a7-5b7b-4989-bb33-f96953d8960c" ],
  "beta:flattenConcept": [ "https://openactive.io/activity-list#984068a7-5b7b-4989-bb33-f96953d8960c" ],
  "beta:excludeConcept": [ "https://openactive.io/activity-list#b976886d-d5f5-49c7-9502-008ab3d3d7a6" ],
  "beta:hideConcept": [ "https://openactive.io/activity-list#d3b5104a-2e31-4cca-a278-ef8e0987a764" ]
};


var generatedScheme = generateSchemeFromRestriction(testRestrictionEMD);

writeFile("output/activity-list.jsonld", JSON.stringify(generatedScheme.scheme, null, 2));
writeFile("output/index.md", generatedScheme.markdown);


function writeFile(file, string) {
  fs.writeFile(file, string, function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("FILE SAVED: " + file);
  }); 
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

function generateSchemeFromRestriction(templateScheme) {
  var restriction = templateScheme["beta:conceptRestriction"];
  var generatedSchemeId = templateScheme["id"];

  var scheme = getScheme(restriction["beta:parentScheme"]);

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

This page contains a human readable form of the restricted [OpenActive](https://www.openactive.io) activity list scheme which can be accessed and should be referenced via the URL [\`${templateScheme.id}\`](${templateScheme.id}).

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

function getScheme(schemeUrl) {
  console.log("Downloading: " + schemeUrl);
  var response = request('GET', schemeUrl, { headers: { accept: 'application/ld+json' } });
  if (response && response.statusCode == 200) {
    var body = JSON.parse(response.getBody('utf8'));
    return body["concept"] && body["id"] && body["type"] === "ConceptScheme" ? body : undefined;
  } else {
    throw "Invalid scheme specified: " + schemeUrl;
  }
}

module.exports = {
  generateSchemeFromRestriction
}
