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

const schema = Joi.object({
	name: Joi.string().alphanum().min(1),

	to: Joi.string().min(1),

	text: Joi.string().min(1),

	type: Joi.any().valid("message", "private_message"),
});

app.post("/participants", (req, res) => {
	const { name } = req.body;

	const { error } = schema.validate({ name });

	if (error) {
		res.sendStatus(422);
		return;
	}

	//procurar no db
	const isParticipantRegistred = participants.some(
		(part) => part.name === name
	);

	if (isParticipantRegistred) {
		res.sendStatus(409);
		return;
	}

	participants.push({
		name: name,
		lastStatus: Date.now(),
	});

	//push massage to db
	messages.push({
		from: name,
		to: "Todos",
		text: "entra na sala...",
		type: "status",
		time: dayjs(new Date()).format("HH:mm:ss"),
	});

	res.sendStatus(201);
});

app.get("/participants", (req, res) => {
	res.send(participants);
});

app.post("/messages", (req, res) => {
	const { to, text, type } = req.body;
	const { user } = req.headers;
	const { error } = schema.validate({ to, text, type });

	const isParticipantOnline = participants.some((part) => part.name === user);

	if (error || !isParticipantOnline) {
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
	const limit = req.query.limit;
	const user = req.headers.user;
	const end = messages.length;
	const start = limit;

	const filteredMessages = messages.filter(
		(msg) => msg.to === "Todos" || msg.to === user || msg.from === user
	);

	if (filteredMessages.length > limit) {
		const sendMessages = filteredMessages.slice(start * -1, end);
		res.send(sendMessages);
		return;
	}

	res.send(filteredMessages);
});

app.post("/status", (req, res) => {
	const user = req.headers.user;

	const searchUser = participants.find((part) => part.name === user);
	const indexUser = participants.indexOf(searchUser);

	if (searchUser) {
		participants[indexUser] = {
			...participants[indexUser],
			lastStatus: Date.now(),
		};
		res.sendStatus(200);
		return;
	}

	res.sendStatus(404);
});

function removeInactiveUser(user) {
	const time = Date.now() - 5000;
	if (user.lastStatus < time) {
		return user;
	}
}

setInterval(() => {
	const inactiveUser = participants
		.map((part) => part)
		.filter(removeInactiveUser);

	inactiveUser.forEach((item) => {
		let searchUser = participants.find((a) => a === item);
		let findIndex = participants.indexOf(searchUser);

		messages.push({
			from: item.name,
			to: "Todos",
			text: "sai da sala...",
			type: "status",
			time: dayjs(new Date()).format("HH:mm:ss"),
		});

		participants.splice(findIndex, 1);
	});
}, 15000);

app.listen(PORT);
