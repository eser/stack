// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Island components for client-side interactivity
 * Demonstrates mixing React and Preact islands
 */

import { useState } from "npm:react";
import { computed, useSignal } from "npm:@preact/signals";
import { LimeRegistry } from "@cool/lime";

// React islands (complex interactivity)
const ReactDataTable = (
  props: { data: Array<{ id: number; name: string; status: string }> },
) => {
  "use client";

  const [sortField, setSortField] = useState<string>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<string>("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  const filteredAndSorted = props.data
    .filter((item) =>
      item.name.toLowerCase().includes(filter.toLowerCase()) ||
      item.status.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const modifier = sortDirection === "asc" ? 1 : -1;
      return aVal < bVal ? -modifier : aVal > bVal ? modifier : 0;
    });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const toggleRow = (id: number) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  return (
    <div style="border: 2px solid #61dafb; padding: 1rem; margin: 1rem 0;">
      <h3 style="color: #61dafb;">📊 React Data Table Island</h3>

      <div style="margin-bottom: 1rem;">
        <input
          type="text"
          placeholder="Filter items..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style="padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; width: 200px;"
        />
        <span style="margin-left: 1rem; color: #666;">
          {selectedRows.size} of {filteredAndSorted.length} selected
        </span>
      </div>

      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 0.5rem; text-align: left;">
              <input
                type="checkbox"
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedRows(
                      new Set(filteredAndSorted.map((item) => item.id)),
                    );
                  } else {
                    setSelectedRows(new Set());
                  }
                }}
                checked={selectedRows.size === filteredAndSorted.length &&
                  filteredAndSorted.length > 0}
              />
            </th>
            <th
              style="padding: 0.5rem; text-align: left; cursor: pointer;"
              onClick={() => handleSort("id")}
            >
              ID {sortField === "id" && (sortDirection === "asc" ? "↑" : "↓")}
            </th>
            <th
              style="padding: 0.5rem; text-align: left; cursor: pointer;"
              onClick={() => handleSort("name")}
            >
              Name{" "}
              {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
            </th>
            <th
              style="padding: 0.5rem; text-align: left; cursor: pointer;"
              onClick={() => handleSort("status")}
            >
              Status{" "}
              {sortField === "status" && (sortDirection === "asc" ? "↑" : "↓")}
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredAndSorted.map((item) => (
            <tr
              key={item.id}
              style={{
                backgroundColor: selectedRows.has(item.id)
                  ? "#e3f2fd"
                  : "white",
                borderBottom: "1px solid #eee",
              }}
            >
              <td style="padding: 0.5rem;">
                <input
                  type="checkbox"
                  checked={selectedRows.has(item.id)}
                  onChange={() => toggleRow(item.id)}
                />
              </td>
              <td style="padding: 0.5rem;">{item.id}</td>
              <td style="padding: 0.5rem;">{item.name}</td>
              <td style="padding: 0.5rem;">
                <span
                  style={{
                    padding: "0.2rem 0.5rem",
                    borderRadius: "4px",
                    fontSize: "0.8rem",
                    backgroundColor: item.status === "active"
                      ? "#d4edda"
                      : "#f8d7da",
                    color: item.status === "active" ? "#155724" : "#721c24",
                  }}
                >
                  {item.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Preact islands (lightweight)
const PreactCalculator = () => {
  const display = useSignal("0");
  const previousValue = useSignal(0);
  const operation = useSignal(null);
  const waitingForNewValue = useSignal(false);

  const inputNumber = (num: string) => {
    if (waitingForNewValue.value) {
      display.value = num;
      waitingForNewValue.value = false;
    } else {
      display.value = display.value === "0" ? num : display.value + num;
    }
  };

  const inputOperation = (nextOperation: string) => {
    const inputValue = parseFloat(display.value);

    if (previousValue.value === 0) {
      previousValue.value = inputValue;
    } else if (operation.value) {
      const currentValue = previousValue.value || 0;
      const newValue = calculate(currentValue, inputValue, operation.value);

      display.value = String(newValue);
      previousValue.value = newValue;
    }

    waitingForNewValue.value = true;
    operation.value = nextOperation;
  };

  const performCalculation = () => {
    const inputValue = parseFloat(display.value);
    const currentValue = previousValue.value || 0;

    if (operation.value) {
      const newValue = calculate(currentValue, inputValue, operation.value);
      display.value = String(newValue);
      previousValue.value = 0;
      operation.value = null;
      waitingForNewValue.value = true;
    }
  };

  const clear = () => {
    display.value = "0";
    previousValue.value = 0;
    operation.value = null;
    waitingForNewValue.value = false;
  };

  const calculate = (firstValue: number, secondValue: number, op: string) => {
    switch (op) {
      case "+":
        return firstValue + secondValue;
      case "-":
        return firstValue - secondValue;
      case "×":
        return firstValue * secondValue;
      case "÷":
        return firstValue / secondValue;
      default:
        return secondValue;
    }
  };

  const Button = ({ onClick, children, variant = "default" }) => (
    <button
      onClick={onClick}
      style={{
        padding: "1rem",
        fontSize: "1.2rem",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        backgroundColor: variant === "operator"
          ? "#673ab8"
          : variant === "clear"
          ? "#f44336"
          : variant === "equals"
          ? "#4caf50"
          : "#f0f0f0",
        color: variant === "default" ? "#333" : "white",
      }}
    >
      {children}
    </button>
  );

  return (
    <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0; width: fit-content;">
      <h3 style="color: #673ab8;">🧮 Preact Calculator Island</h3>

      <div style="margin-bottom: 1rem; padding: 1rem; background: #333; color: white; text-align: right; font-size: 2rem; border-radius: 4px;">
        {display.value}
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; width: 250px;">
        <Button variant="clear" onClick={clear}>C</Button>
        <Button onClick={() => inputOperation("÷")}>÷</Button>
        <Button onClick={() => inputOperation("×")}>×</Button>
        <Button onClick={() => inputOperation("-")}>-</Button>

        <Button onClick={() => inputNumber("7")}>7</Button>
        <Button onClick={() => inputNumber("8")}>8</Button>
        <Button onClick={() => inputNumber("9")}>9</Button>
        <Button variant="operator" onClick={() => inputOperation("+")}>
          +
        </Button>

        <Button onClick={() => inputNumber("4")}>4</Button>
        <Button onClick={() => inputNumber("5")}>5</Button>
        <Button onClick={() => inputNumber("6")}>6</Button>
        <Button
          variant="equals"
          onClick={performCalculation}
          style="grid-row: span 2;"
        >
          =
        </Button>

        <Button onClick={() => inputNumber("1")}>1</Button>
        <Button onClick={() => inputNumber("2")}>2</Button>
        <Button onClick={() => inputNumber("3")}>3</Button>

        <Button onClick={() => inputNumber("0")} style="grid-column: span 2;">
          0
        </Button>
        <Button onClick={() => inputNumber(".")}>.</Button>
      </div>
    </div>
  );
};

const PreactTimer = (props: { initialSeconds?: number }) => {
  const seconds = useSignal(props.initialSeconds || 60);
  const isRunning = useSignal(false);
  const intervalId = useSignal(null);

  const formattedTime = computed(() => {
    const mins = Math.floor(seconds.value / 60);
    const secs = seconds.value % 60;
    return `${mins.toString().padStart(2, "0")}:${
      secs.toString().padStart(2, "0")
    }`;
  });

  const start = () => {
    if (!isRunning.value) {
      isRunning.value = true;
      intervalId.value = setInterval(() => {
        if (seconds.value > 0) {
          seconds.value--;
        } else {
          stop();
        }
      }, 1000);
    }
  };

  const stop = () => {
    isRunning.value = false;
    if (intervalId.value) {
      clearInterval(intervalId.value);
      intervalId.value = null;
    }
  };

  const reset = () => {
    stop();
    seconds.value = props.initialSeconds || 60;
  };

  return (
    <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0; text-align: center;">
      <h3 style="color: #673ab8;">⏱️ Preact Timer Island</h3>

      <div style="font-size: 3rem; font-weight: bold; color: seconds.value <= 10 ? '#f44336' : '#333'; margin: 1rem 0;">
        {formattedTime.value}
      </div>

      <div style="display: flex; gap: 0.5rem; justify-content: center;">
        <button
          onClick={start}
          disabled={isRunning.value}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: isRunning.value ? "#ccc" : "#4caf50",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: isRunning.value ? "not-allowed" : "pointer",
          }}
        >
          Start
        </button>

        <button
          onClick={stop}
          disabled={!isRunning.value}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: !isRunning.value ? "#ccc" : "#f44336",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: !isRunning.value ? "not-allowed" : "pointer",
          }}
        >
          Stop
        </button>

        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#673ab8",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      {seconds.value === 0 && (
        <div style="margin-top: 1rem; color: #f44336; font-weight: bold;">
          ⏰ Time's up!
        </div>
      )}
    </div>
  );
};

/**
 * Register island components
 */
export const limeModule = (registry: LimeRegistry) => {
  registry.addIsland("DataTable", ReactDataTable, {
    adapter: "react",
    props: ["data"],
    hydration: "visible",
  });

  registry.addIsland("Calculator", PreactCalculator, {
    adapter: "preact",
    props: [],
    hydration: "idle",
  });

  registry.addIsland("Timer", PreactTimer, {
    adapter: "preact",
    props: ["initialSeconds"],
    hydration: "idle",
  });

  // Simple counter island for demonstration
  registry.addIsland("Counter", PreactCounter, {
    adapter: "preact",
    props: ["initialValue", "label"],
    hydration: "visible",
  });
};

// Simple Preact Counter for demonstration
const PreactCounter = (props: { initialValue?: number; label?: string }) => {
  const count = useSignal(props.initialValue || 0);

  return (
    <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0; text-align: center;">
      <h4 style="color: #673ab8;">{props.label || "Counter"}</h4>
      <div style="font-size: 2rem; font-weight: bold; margin: 1rem 0;">
        {count.value}
      </div>
      <div style="display: flex; gap: 0.5rem; justify-content: center;">
        <button
          onClick={() => count.value--}
          style="padding: 0.5rem 1rem; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          -
        </button>
        <button
          onClick={() => count.value++}
          style="padding: 0.5rem 1rem; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          +
        </button>
        <button
          onClick={() => count.value = 0}
          style="padding: 0.5rem 1rem; background: #673ab8; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
