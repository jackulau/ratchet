import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LAPTOP_WORKFLOWS,
  LAPTOP_BRAND_GUIDES,
  getLaptopWorkflow,
  listLaptopWorkflows,
} from "./laptop-workflows.js";
import type { WorkflowConclusion } from "./workflows.js";

function isConclusion(v: string | WorkflowConclusion): v is WorkflowConclusion {
  return typeof v === "object" && "cause" in v;
}

// ─── Workflow Registry ──────────────────────────────────────────────────────

describe("LAPTOP_WORKFLOWS registry", () => {
  const expectedIds = [
    "thinkpad-no-power",
    "dell-no-power",
    "hp-no-power",
    "asus-no-power",
    "apple-no-power",
    "laptop-no-charge",
    "laptop-no-backlight",
    "laptop-keyboard-dead",
    "laptop-no-wifi",
    "laptop-overheating",
  ];

  it("contains all required workflow IDs", () => {
    for (const id of expectedIds) {
      assert.ok(LAPTOP_WORKFLOWS[id], `Missing workflow: ${id}`);
    }
  });

  it("contains exactly the expected number of workflows", () => {
    assert.equal(Object.keys(LAPTOP_WORKFLOWS).length, expectedIds.length);
  });

  it("each workflow has a name and description", () => {
    for (const [id, wf] of Object.entries(LAPTOP_WORKFLOWS)) {
      assert.ok(wf.name.length > 0, `${id} missing name`);
      assert.ok(wf.description.length > 0, `${id} missing description`);
    }
  });
});

// ─── Workflow Structure Validation ──────────────────────────────────────────

describe("Workflow structure validation", () => {
  for (const [id, wf] of Object.entries(LAPTOP_WORKFLOWS)) {
    describe(`workflow: ${id}`, () => {
      it("has 5-8 steps", () => {
        assert.ok(
          wf.steps.length >= 5 && wf.steps.length <= 8,
          `${id} has ${wf.steps.length} steps (expected 5-8)`,
        );
      });

      it("first step has id 'start'", () => {
        assert.equal(wf.steps[0].id, "start", `${id} first step should be 'start'`);
      });

      it("all step IDs are unique", () => {
        const ids = wf.steps.map((s) => s.id);
        const unique = new Set(ids);
        assert.equal(ids.length, unique.size, `${id} has duplicate step IDs`);
      });

      it("every step has instruction, question, and at least one branch", () => {
        for (const step of wf.steps) {
          assert.ok(step.instruction.length > 0, `${id}/${step.id} missing instruction`);
          assert.ok(step.question.length > 0, `${id}/${step.id} missing question`);
          assert.ok(
            Object.keys(step.branches).length >= 1,
            `${id}/${step.id} has no branches`,
          );
        }
      });

      it("all branch targets reference valid step IDs or are conclusions", () => {
        const stepIds = new Set(wf.steps.map((s) => s.id));
        for (const step of wf.steps) {
          for (const [answer, target] of Object.entries(step.branches)) {
            if (typeof target === "string") {
              assert.ok(
                stepIds.has(target),
                `${id}/${step.id} branch '${answer}' points to non-existent step '${target}'`,
              );
            } else {
              // WorkflowConclusion
              assert.ok(target.cause.length > 0, `${id}/${step.id}/${answer} conclusion missing cause`);
              assert.ok(target.fix.length > 0, `${id}/${step.id}/${answer} conclusion missing fix`);
              assert.ok(
                [1, 2, 3, 4, 5].includes(target.difficulty),
                `${id}/${step.id}/${answer} conclusion has invalid difficulty: ${target.difficulty}`,
              );
              assert.ok(Array.isArray(target.tools), `${id}/${step.id}/${answer} conclusion tools must be an array`);
            }
          }
        }
      });

      it("every non-start step is reachable from another step", () => {
        const reachableFromBranches = new Set<string>();
        for (const step of wf.steps) {
          for (const target of Object.values(step.branches)) {
            if (typeof target === "string") {
              reachableFromBranches.add(target);
            }
          }
        }
        for (const step of wf.steps) {
          if (step.id === "start") continue;
          assert.ok(
            reachableFromBranches.has(step.id),
            `${id}/${step.id} is unreachable (no branch points to it)`,
          );
        }
      });

      it("all terminal paths end in a WorkflowConclusion", () => {
        // Walk the graph and ensure every path terminates at a conclusion
        const visited = new Set<string>();

        function hasTermination(stepId: string): boolean {
          if (visited.has(stepId)) return true; // cycle protection
          visited.add(stepId);

          const step = wf.steps.find((s) => s.id === stepId);
          if (!step) return false;

          for (const target of Object.values(step.branches)) {
            if (isConclusion(target)) continue; // this branch terminates
            if (!hasTermination(target)) return false;
          }
          return true;
        }

        assert.ok(
          hasTermination("start"),
          `${id} has a path that never reaches a conclusion`,
        );
      });
    });
  }
});

// ─── Brand-Specific Content Checks ──────────────────────────────────────────

describe("ThinkPad no-power workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["thinkpad-no-power"];

  it("mentions EC reset (30 second hold)", () => {
    const startStep = wf.steps.find((s) => s.id === "start")!;
    assert.ok(startStep.instruction.includes("30"), "should mention 30 second hold");
  });

  it("references NPCE985 EC chip", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("NPCE985"), "should reference NPCE985 EC chip");
  });

  it("references ISL9240 charging IC", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("ISL9240"), "should reference ISL9240");
  });

  it("references USB-C PD negotiation", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("20V") || allText.includes("PD"), "should reference PD or 20V");
  });
});

describe("Dell no-power workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["dell-no-power"];

  it("mentions LED blink codes (amber/white pattern)", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("amber"), "should mention amber LED");
    assert.ok(allText.includes("white"), "should mention white LED");
  });

  it("references BQ25700 or BQ24780", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("BQ25700") || allText.includes("BQ24780"), "should reference BQ charging IC");
  });

  it("references ISL95338", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("ISL95338"), "should reference ISL95338");
  });
});

describe("HP no-power workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["hp-no-power"];

  it("mentions caps lock blink codes", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.toLowerCase().includes("caps lock") || allText.toLowerCase().includes("capslock"),
      "should mention caps lock blink codes");
  });

  it("mentions HP hard reset (15 second hold)", () => {
    const startStep = wf.steps.find((s) => s.id === "start")!;
    assert.ok(startStep.instruction.includes("15"), "should mention 15 second hold");
  });

  it("references TPS65982", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("TPS65982"), "should reference TPS65982 USB-C PD controller");
  });
});

describe("ASUS no-power workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["asus-no-power"];

  it("mentions ASUS EC reset (extended hold)", () => {
    const startStep = wf.steps.find((s) => s.id === "start")!;
    assert.ok(startStep.instruction.includes("40"), "should mention 40 second hold for ASUS");
  });

  it("references VRM failures", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("VRM") || allText.includes("MOSFET"), "should reference VRM failures");
  });
});

describe("Apple no-power workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["apple-no-power"];

  it("mentions MagSafe LED color", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("MagSafe"), "should mention MagSafe");
  });

  it("mentions SMC reset key combo", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("Shift") && allText.includes("Ctrl") && allText.includes("Option"),
      "should mention SMC reset key combination");
  });

  it("references CD3217 Thunderbolt controller", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("CD3217"), "should reference CD3217");
  });

  it("references T2 or M-series chip", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("T2") || allText.includes("M1"), "should reference T2 or M1 chip");
  });

  it("mentions liquid damage indicators", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("liquid"), "should mention liquid damage");
  });
});

// ─── Generic Workflow Content Checks ────────────────────────────────────────

describe("laptop-no-charge workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["laptop-no-charge"];

  it("checks charger wattage compatibility", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("wattage") || allText.toLowerCase().includes("watt"),
      "should check charger wattage");
  });

  it("references charge IC", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("BQ25700") || allText.includes("ISL9240") || allText.toLowerCase().includes("charging ic"),
      "should reference charging IC");
  });

  it("checks battery connector", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("battery connector") || allText.toLowerCase().includes("connector"),
      "should check battery connector");
  });
});

describe("laptop-no-backlight workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["laptop-no-backlight"];

  it("mentions flashlight test", () => {
    const startStep = wf.steps.find((s) => s.id === "start")!;
    assert.ok(startStep.instruction.toLowerCase().includes("flashlight"), "should mention flashlight test");
  });

  it("checks backlight fuse", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("fuse"), "should check backlight fuse");
  });

  it("checks backlight driver IC", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("driver"), "should check backlight driver IC");
  });

  it("checks LVDS/eDP cable", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("LVDS") || allText.includes("eDP"), "should check LVDS or eDP cable");
  });
});

describe("laptop-keyboard-dead workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["laptop-keyboard-dead"];

  it("checks ribbon cable", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("ribbon"), "should check ribbon cable");
  });

  it("tests external USB keyboard", () => {
    const startStep = wf.steps.find((s) => s.id === "start")!;
    assert.ok(startStep.instruction.toLowerCase().includes("usb") || startStep.instruction.toLowerCase().includes("external"),
      "should test external USB keyboard");
  });

  it("checks EC keyboard controller", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.includes("EC") || allText.toLowerCase().includes("embedded controller"),
      "should check EC keyboard controller");
  });
});

describe("laptop-no-wifi workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["laptop-no-wifi"];

  it("checks M.2 slot", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.includes("M.2"), "should check M.2 slot");
  });

  it("checks antenna cables", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("antenna"), "should check antenna cables");
  });

  it("checks BIOS whitelist", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.toLowerCase().includes("whitelist"), "should check BIOS whitelist");
  });

  it("checks WiFi kill switch", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("switch") || allText.toLowerCase().includes("airplane"),
      "should check WiFi kill switch or airplane mode");
  });
});

describe("laptop-overheating workflow content", () => {
  const wf = LAPTOP_WORKFLOWS["laptop-overheating"];

  it("checks fan RPM", () => {
    const allText = wf.steps.map((s) => s.instruction + JSON.stringify(s.branches)).join(" ");
    assert.ok(allText.toLowerCase().includes("fan") && (allText.toLowerCase().includes("rpm") || allText.toLowerCase().includes("spin")),
      "should check fan RPM or spinning");
  });

  it("checks thermal paste", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("thermal paste"), "should check thermal paste");
  });

  it("checks heatsink mounting", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("heatsink"), "should check heatsink mounting");
  });

  it("checks air vents", () => {
    const allText = wf.steps.map((s) => s.instruction).join(" ");
    assert.ok(allText.toLowerCase().includes("vent") || allText.toLowerCase().includes("airflow"),
      "should check air vents");
  });
});

// ─── getLaptopWorkflow ──────────────────────────────────────────────────────

describe("getLaptopWorkflow", () => {
  it("returns a workflow for a valid ID", () => {
    const wf = getLaptopWorkflow("thinkpad-no-power");
    assert.ok(wf);
    assert.equal(wf.name, "ThinkPad No Power Troubleshooter");
  });

  it("returns undefined for unknown ID", () => {
    assert.equal(getLaptopWorkflow("nonexistent-workflow"), undefined);
  });

  it("returns the correct workflow for each brand", () => {
    const dell = getLaptopWorkflow("dell-no-power");
    assert.ok(dell);
    assert.ok(dell.name.includes("Dell"));

    const hp = getLaptopWorkflow("hp-no-power");
    assert.ok(hp);
    assert.ok(hp.name.includes("HP"));

    const apple = getLaptopWorkflow("apple-no-power");
    assert.ok(apple);
    assert.ok(apple.name.includes("MacBook") || apple.name.includes("Apple"));
  });
});

// ─── listLaptopWorkflows ────────────────────────────────────────────────────

describe("listLaptopWorkflows", () => {
  it("returns all workflows with id, name, and description", () => {
    const list = listLaptopWorkflows();
    assert.equal(list.length, Object.keys(LAPTOP_WORKFLOWS).length);

    for (const item of list) {
      assert.ok(item.id.length > 0, "item must have an id");
      assert.ok(item.name.length > 0, "item must have a name");
      assert.ok(item.description.length > 0, "item must have a description");
    }
  });

  it("each item corresponds to a valid workflow", () => {
    const list = listLaptopWorkflows();
    for (const item of list) {
      assert.ok(LAPTOP_WORKFLOWS[item.id], `Listed workflow '${item.id}' not found in LAPTOP_WORKFLOWS`);
      assert.equal(item.name, LAPTOP_WORKFLOWS[item.id].name);
      assert.equal(item.description, LAPTOP_WORKFLOWS[item.id].description);
    }
  });
});

// ─── LAPTOP_BRAND_GUIDES ───────────────────────────────────────────────────

describe("LAPTOP_BRAND_GUIDES", () => {
  const expectedBrands = ["lenovo", "dell", "hp", "asus", "apple", "acer", "msi"];

  it("contains all required brand guides", () => {
    for (const brand of expectedBrands) {
      assert.ok(LAPTOP_BRAND_GUIDES[brand], `Missing brand guide: ${brand}`);
    }
  });

  it("contains exactly the expected number of guides", () => {
    assert.equal(Object.keys(LAPTOP_BRAND_GUIDES).length, expectedBrands.length);
  });

  for (const brandKey of expectedBrands) {
    describe(`brand guide: ${brandKey}`, () => {
      it("has all required BrandGuide fields", () => {
        const guide = LAPTOP_BRAND_GUIDES[brandKey];
        assert.ok(guide.brand.length > 0, "brand name must not be empty");
        assert.ok(guide.commonEcChips.length > 0, "must list at least one EC chip");
        assert.ok(guide.commonChargeIcs.length > 0, "must list at least one charge IC");
        assert.ok(guide.commonVrms.length > 0, "must list at least one VRM");
        assert.ok(guide.biosAccessKey.length > 0, "must have BIOS access key");
        assert.ok(guide.resetProcedure.length > 0, "must have reset procedure");
        assert.ok(guide.diagnosticMode.length > 0, "must have diagnostic mode");
        assert.ok(guide.knownIssues.length > 0, "must list at least one known issue");
      });

      it("EC chips are strings", () => {
        const guide = LAPTOP_BRAND_GUIDES[brandKey];
        for (const chip of guide.commonEcChips) {
          assert.equal(typeof chip, "string");
          assert.ok(chip.length > 0);
        }
      });

      it("charge ICs are strings", () => {
        const guide = LAPTOP_BRAND_GUIDES[brandKey];
        for (const ic of guide.commonChargeIcs) {
          assert.equal(typeof ic, "string");
          assert.ok(ic.length > 0);
        }
      });

      it("VRMs are strings", () => {
        const guide = LAPTOP_BRAND_GUIDES[brandKey];
        for (const vrm of guide.commonVrms) {
          assert.equal(typeof vrm, "string");
          assert.ok(vrm.length > 0);
        }
      });

      it("known issues are strings", () => {
        const guide = LAPTOP_BRAND_GUIDES[brandKey];
        for (const issue of guide.knownIssues) {
          assert.equal(typeof issue, "string");
          assert.ok(issue.length > 0);
        }
      });
    });
  }
});

// ─── Schematic-less validation ──────────────────────────────────────────────

describe("Schematic-less diagnostics", () => {
  it("no workflow step requires reading a schematic", () => {
    for (const [id, wf] of Object.entries(LAPTOP_WORKFLOWS)) {
      for (const step of wf.steps) {
        const text = step.instruction.toLowerCase();
        assert.ok(
          !text.includes("refer to schematic") && !text.includes("check schematic") && !text.includes("open schematic"),
          `${id}/${step.id} should not require a schematic`,
        );
      }
    }
  });

  it("steps reference physical inspection techniques (visual, multimeter, etc.)", () => {
    for (const [id, wf] of Object.entries(LAPTOP_WORKFLOWS)) {
      const allInstructions = wf.steps.map((s) => s.instruction.toLowerCase()).join(" ");
      const allBranches = wf.steps.map((s) => JSON.stringify(s.branches).toLowerCase()).join(" ");
      const allText = allInstructions + " " + allBranches;
      // Each workflow should reference at least one physical diagnostic technique
      const hasPhysicalDiag = allText.includes("multimeter") ||
        allText.includes("inspect") ||
        allText.includes("visual") ||
        allText.includes("check") ||
        allText.includes("observe") ||
        allText.includes("measure") ||
        allText.includes("look for");
      assert.ok(hasPhysicalDiag, `${id} should reference physical diagnostic techniques`);
    }
  });
});
