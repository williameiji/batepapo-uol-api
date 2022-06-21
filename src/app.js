import express from "express";
import cors from "cors";
import Joi from "joi";
import dayjs from "dayjs";

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(cors());

const participants = [];
const messages = [];

app.post("/participants", (req, res) => {
	const user = req.body;

	const { error, value } = Joi.string().alphanum().min(1).validate(user.name);

	if (error) {
		res.sendStatus(422);
		return;
	}

	//procurar no db
	const isParticipantRegistred = participants.some(
		(part) => part.name === user.name
	);

	if (isParticipantRegistred) {
		res.sendStatus(409);
		return;
	}

	participants.push({
		name: user.name,
		lastStatus: Date.now(),
	});

	res.sendStatus(201);
});

app.get("/participants", (req, res) => {
	res.send(participants);
});

app.post("/messages", (req, res) => {
	const { to, text, type } = req.body;
	const { user } = req.headers;

	const toError = Joi.string().min(1).validate(to);
	const textError = Joi.string().min(1).validate(text);
	const typeError = Joi.any()
		.valid("message", "private_message")
		.validate(type);

	const isParticipantOnline = participants.some((part) => part.name === user);

	if (
		toError.error ||
		textError.error ||
		typeError.error ||
		!isParticipantOnline
	) {
		res.sendStatus(422);
		return;
	}

	messages.push({
		from: user,
		to,
		text,
		type,
		time: dayjs(new Date()).format("HH:mm:ss"),
	});

	res.sendStatus(201);
});

app.get("/messages", (req, res) => {
	res.send(messages);
});

app.listen(PORT);
