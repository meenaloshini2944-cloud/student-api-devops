const request = require("supertest");
const fs = require("fs");
const path = require("path");

const app = require("../src/app");

const dataPath = path.join(__dirname, "..", "src", "data", "students.json");

function resetData() {
  fs.writeFileSync(dataPath, JSON.stringify([], null, 2));
}

describe("Student API", () => {
  beforeEach(() => {
    resetData();
  });

  test("GET /health should return status UP", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: "UP" });
  });

  test("GET /students should return empty array initially", async () => {
    const res = await request(app).get("/students");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  test("POST /students should create a student", async () => {
    const payload = { name: "Meena", email: "meena@example.com", course: "Cyber Security" };

    const res = await request(app).post("/students").send(payload);
    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe(payload.name);
    expect(res.body.email).toBe(payload.email);
    expect(res.body.course).toBe(payload.course);

    const list = await request(app).get("/students");
    expect(list.statusCode).toBe(200);
    expect(list.body.length).toBe(1);
  });

  test("POST /students should fail if required fields missing", async () => {
    const res = await request(app).post("/students").send({ name: "OnlyName" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  test("GET /students/:id should return 404 for unknown student", async () => {
    const res = await request(app).get("/students/999999");
    expect(res.statusCode).toBe(404);
  });

  test("PUT /students/:id should update an existing student", async () => {
    const created = await request(app).post("/students").send({
      name: "Meena",
      email: "meena@example.com",
      course: "Cyber Security",
    });

    const id = created.body.id;

    const updated = await request(app).put(`/students/${id}`).send({
      course: "DevOps",
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.body.course).toBe("DevOps");
  });

  test("DELETE /students/:id should delete an existing student", async () => {
    const created = await request(app).post("/students").send({
      name: "Meena",
      email: "meena@example.com",
      course: "Cyber Security",
    });

    const id = created.body.id;

    const del = await request(app).delete(`/students/${id}`);
    expect(del.statusCode).toBe(200);

    const list = await request(app).get("/students");
    expect(list.body.length).toBe(0);
  });
});
