const fs = require("fs");
const path = require("path");

const dataPath = path.join(__dirname, "..", "data", "students.json");

function readStudents() {
  if (!fs.existsSync(dataPath)) return [];
  const raw = fs.readFileSync(dataPath, "utf-8");
  return raw ? JSON.parse(raw) : [];
}

function writeStudents(students) {
  fs.writeFileSync(dataPath, JSON.stringify(students, null, 2));
}

function getAllStudents(req, res) {
  return res.status(200).json(readStudents());
}

function getStudentById(req, res) {
  const id = String(req.params.id);
  const students = readStudents();
  const found = students.find((s) => String(s.id) === id);
  if (!found) return res.status(404).json({ message: "Student not found" });
  return res.status(200).json(found);
}

function createStudent(req, res) {
  const { name, email, course } = req.body;
  if (!name || !email || !course) {
    return res.status(400).json({ message: "name, email, course are required" });
  }

  const students = readStudents();
  const newStudent = {
    id: Date.now(),
    name: String(name).trim(),
    email: String(email).trim(),
    course: String(course).trim(),
  };

  students.push(newStudent);
  writeStudents(students);
  return res.status(201).json(newStudent);
}

function updateStudent(req, res) {
  const id = String(req.params.id);
  const { name, email, course } = req.body;

  const students = readStudents();
  const idx = students.findIndex((s) => String(s.id) === id);
  if (idx === -1) return res.status(404).json({ message: "Student not found" });

  students[idx] = {
    ...students[idx],
    ...(name !== undefined ? { name: String(name).trim() } : {}),
    ...(email !== undefined ? { email: String(email).trim() } : {}),
    ...(course !== undefined ? { course: String(course).trim() } : {}),
  };

  writeStudents(students);
  return res.status(200).json(students[idx]);
}

function deleteStudent(req, res) {
  const id = String(req.params.id);
  const students = readStudents();
  const idx = students.findIndex((s) => String(s.id) === id);
  if (idx === -1) return res.status(404).json({ message: "Student not found" });

  const removed = students.splice(idx, 1)[0];
  writeStudents(students);
  return res.status(200).json({ message: "Deleted", removed });
}

module.exports = {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
};
