import assert from "node:assert/strict";

const JSON_TYPES = new Set(["array", "boolean", "integer", "null", "number", "object", "string"]);

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function acceptsType(declared, actual) {
  return declared.includes(actual) || (actual === "integer" && declared.includes("number"));
}

export function assertStrictOutputSchema(schema, {name = "structured output schema"} = {}) {
  const visit = (node, location) => {
    assert(node && typeof node === "object" && !Array.isArray(node), `${name} ${location} must be a schema object`);
    const declared = Array.isArray(node.type) ? node.type : [node.type];
    assert(declared.every((type) => JSON_TYPES.has(type)), `${name} ${location} must declare an explicit JSON type`);
    assert.equal(new Set(declared).size, declared.length, `${name} ${location} contains duplicate JSON types`);

    if (Object.hasOwn(node, "const")) {
      assert(acceptsType(declared, valueType(node.const)), `${name} ${location} const does not match its declared type`);
    }
    if (Object.hasOwn(node, "enum")) {
      assert(Array.isArray(node.enum) && node.enum.length > 0, `${name} ${location} enum must be non-empty`);
      for (const value of node.enum) assert(acceptsType(declared, valueType(value)), `${name} ${location} enum value does not match its declared type`);
    }

    if (declared.includes("object")) {
      assert.equal(node.additionalProperties, false, `${name} ${location} object must set additionalProperties=false`);
      assert(node.properties && typeof node.properties === "object" && !Array.isArray(node.properties), `${name} ${location} object must declare properties`);
      assert(Array.isArray(node.required), `${name} ${location} object must declare required`);
      const properties = Object.keys(node.properties).sort();
      const required = [...node.required].sort();
      assert.deepEqual(required, properties, `${name} ${location} must require every declared property; use an explicit null union for optional values`);
      for (const [key, child] of Object.entries(node.properties)) visit(child, `${location}.properties.${key}`);
    }
    if (declared.includes("array")) {
      assert(node.items && typeof node.items === "object" && !Array.isArray(node.items), `${name} ${location} array must declare one items schema`);
      visit(node.items, `${location}.items`);
    }
  };

  visit(schema, "$");
  return schema;
}
