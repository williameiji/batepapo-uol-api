import express from "express";
import cors from "cors";
import Joi from "joi";

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());

const schema = Joi.object({
	name: Joi.string().alphanum().min(3).max(30).required(),
});

const participants = [];

app.post("/participants", (req, res) => {
	const { name } = req.body;

	const { error, value } = schema.validate({ name });

	if (error) {
		res.sendStatus(422);
		return;
	}

	//procurar no db
	const isParticipantRegistred = participants.some(
		(user) => user.name === name
	);

	if (isParticipantRegistred) {
		res.sendStatus(409);
		return;
	}

	participants.push({
		name,
		lastStatus: Date.now(),
	});

	res.sendStatus(201);
});

app.get("/participants", (req, res) => {
	//get
});

app.listen(PORT);
