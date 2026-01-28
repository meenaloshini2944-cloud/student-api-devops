const request = require("supertest");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

const app = require("../src/app");

const dataPath = path.join(__dirname, "..", "src", "data", "students.json");

function resetData() {
  fs.writeFileSync(dataPath, JSON.stringify([], null, 2));
}

describe("Student API", function () {
  beforeEach(function () {
    resetData();
  });

  it("GET /health should return status UP", async function () {
    const res = await request(app).get("/health");
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ status: "UP" });
  });

  it("GET /students should return empty array initially", async function () {
    const res = await request(app).get("/students");
    expect(res.status).to.equal(200);
    expect(res.body).to.be.an("array");
    expect(res.body.length).to.equal(0);
  });

  it("POST /students should create a student", async function () {
    const payload = { name: "Meena", email: "meena@example.com", course: "Cyber Security" };

    const res = await request(app).post("/students").send(payload);
    expect(res.status).to.equal(201);
    expect(res.body).to.have.property("id");
    expect(res.body.name).to.equal(payload.name);
    expect(res.body.email).to.equal(payload.email);
    expect(res.body.course).to.equal(payload.course);

    const list = await request(app).get("/students");
    expect(list.status).to.equal(200);
    expect(list.body.length).to.equal(1);
  });

  it("POST /students should fail if required fields missing", async function () {
    const res = await request(app).post("/students").send({ name: "OnlyName" });
    expect(res.status).to.equal(400);
    expect(res.body).to.have.property("message");
  });

  it("GET /students/:id should return 404 for unknown student", async function () {
    const res = await request(app).get("/students/999999");
    expect(res.status).to.equal(404);
  });

  it("PUT /students/:id should update an existing student", async function () {
    const created = await request(app).post("/students").send({
      name: "Meena",
      email: "meena@example.com",
      course: "Cyber Security",
    });

    const id = created.body.id;

    const updated = await request(app).put(`/students/${id}`).send({
      course: "DevOps",
    });

    expect(updated.status).to.equal(200);
    expect(updated.body.course).to.equal("DevOps");
  });

  it("DELETE /students/:id should delete an existing student", async function () {
    const created = await request(app).post("/students").send({
      name: "Meena",
      email: "meena@example.com",
      course: "Cyber Security",
    });

    const id = created.body.id;

    const del = await request(app).delete(`/students/${id}`);
    expect(del.status).to.equal(200);

    const list = await request(app).get("/students");
    expect(list.body.length).to.equal(0);
  });
});
