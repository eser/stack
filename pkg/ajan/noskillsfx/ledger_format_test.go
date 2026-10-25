// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"strings"
	"testing"
)

func TestFormatLedger(t *testing.T) {
	t.Parallel()

	record := `{"id":"d-1","state":"DISCOVERY","category":"scope","question":"Which file types?",` +
		`"resolution":"JPEG and PNG","provenance":"ratified","timestamp":"t","artifacts":[]}`
	summary := `{"resolved_decisions":1,"provenance_breakdown":{"ratified":1,"inferred":0,"default":0},` +
		`"open_questions":2,"specificity":{"named_artifacts_count":3,"acceptance_criteria_present":true,"out_of_scope_present":false}}`

	cases := []struct {
		name, data, format, want string
	}{
		{"markdown", `{"spec":"upload","records":[` + record + `],"summary":` + summary + `}`, OutputMarkdown,
			"# Decision ledger: upload\n\n## Decisions\n\n" +
				"- d-1 (DISCOVERY, scope, ratified): Which file types? JPEG and PNG\n\n## Summary\n\n" +
				"- Resolved decisions: 1 (ratified 1, inferred 0, default 0)\n- Open questions: 2\n" +
				"- Named artifacts: 3\n- Acceptance criteria: present\n- Out of scope: missing"},
		{"text, empty", `{"spec":"upload","records":[],"summary":null}`, OutputText,
			"Decision ledger: upload\n\nDecisions:\n\nNo decisions recorded.\n\nSummary:\n\nNo summary yet."},
		{"summary without fields", `{"spec":"s","records":[],"summary":{}}`, OutputText,
			"Decision ledger: s\n\nDecisions:\n\nNo decisions recorded.\n\nSummary:\n\n" +
				"- Resolved decisions: undefined (ratified undefined, inferred undefined, default undefined)\n" +
				"- Open questions: undefined\n- Named artifacts: undefined\n- Acceptance criteria: missing\n- Out of scope: missing"},
	}

	for _, tc := range cases {
		output, _ := mustParse(t, tc.data).(*JSObject)

		got, err := FormatLedger(output, tc.format)
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}

		if got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestFormatMeasurementDraft(t *testing.T) {
	t.Parallel()

	records, _ := mustParse(t, `[{"id":"d-1","state":"DISCOVERY","category":"scope","question":"Q?",`+
		`"resolution":"A","provenance":"inferred"}]`).([]any)

	got, err := FormatMeasurementDraft(MeasurementDraft("upload", records), OutputMarkdown)
	if err != nil {
		t.Fatal(err)
	}

	want := "# upload (live ledger)\n\n## Decisions\n\n- d-1 (DISCOVERY, scope, inferred): Q? A"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}

	if json, _ := FormatMeasurementDraft(MeasurementDraft("upload", nil), OutputJSON); !strings.Contains(json, `"measurement-report/v1"`) {
		t.Errorf("json: %q", json)
	}
}
