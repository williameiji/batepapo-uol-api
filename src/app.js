import express from "express";
import cors from "cors";
import Joi from "joi";
import dayjs from "dayjs";
import { MongoClient, ObjectId } from "mongodb";
import { stripHtml } from "string-strip-html";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors());

const mongoClient = new MongoClient(process.env.MONGO_URL);
let db;

mongoClient.connect().then(() => {
	db = mongoClient.db("batepapo_uol");
});

const schemaUsername = Joi.object({
	name: Joi.string().min(1).required(),
});

const schemaMessages = Joi.object({
	to: Joi.string().min(1).required(),

	text: Joi.string().min(1).required(),

	type: Joi.any().valid("message", "private_message").required(),
});

app.post("/participants", async (req, res) => {
	const { name } = req.body;
	const { error } = schemaUsername.validate({ name: name });

	if (error) {
		res.sendStatus(422);
		return;
	}

	try {
		const isUserOnline = await db.collection("users").findOne({
			name: name,
		});

		if (isUserOnline) {
			res.sendStatus(409);
			return;
		}

		await db.collection("users").insertOne({
			name: stripHtml(name.trim()).result,
			lastStatus: Date.now(),
		});

		await db.collection("messages").insertOne({
			from: stripHtml(name.trim()).result,
			to: "Todos",
			text: "entra na sala...",
			type: "status",
			time: dayjs(new Date()).format("HH:mm:ss"),
		});

		res.sendStatus(201);
	} catch (error) {
		res.sendStatus(500);
	}
});

app.get("/participants", async (req, res) => {
	try {
		const allParticipants = await db.collection("users").find().toArray();

		res.send(allParticipants);
	} catch (error) {
		res.sendStatus(500);
	}
});

app.post("/messages", async (req, res) => {
	const newMessage = req.body;
	const { user } = req.headers;
	const { error } = schemaMessages.validate(newMessage);

	try {
		const isParticipantOnline = await db
			.collection("users")
			.findOne({ name: user });

		if (error || !isParticipantOnline) {
			res.sendStatus(422);
			return;
		}

		await db.collection("messages").insertOne({
			from: stripHtml(user.trim()).result,
			to: stripHtml(newMessage.to.trim()).result,
			text: stripHtml(newMessage.text.trim()).result,
			type: stripHtml(newMessage.type.trim()).result,
			time: dayjs(new Date()).format("HH:mm:ss"),
		});

		res.sendStatus(201);
	} catch (error) {
		res.sendStatus(500);
	}
});

app.get("/messages", async (req, res) => {
	const limit = req.query.limit;
	const { user } = req.headers;
	const start = limit * -1;

	try {
		const allMessages = await db.collection("messages").find().toArray();

		const filteredMessages = allMessages.filter(
			(msg) => msg.to === "Todos" || msg.to === user || msg.from === user
		);
		if (filteredMessages.length > limit) {
			const sendMessages = filteredMessages.slice(
				start,
				filteredMessages.length
			);

			res.send(sendMessages);
			return;
		}

		res.send(filteredMessages);
	} catch (error) {
		res.sendStatus(500);
	}
});

app.delete("/messages/:idMessage", async (req, res) => {
	const id = req.params.idMessage;
	const { user } = req.headers;

	try {
		const MessageToDelete = await db
			.collection("messages")
			.findOne({ _id: ObjectId(`${id}`) });

		if (user !== MessageToDelete.from) {
			res.sendStatus(401);
			return;
		}

		await db.collection("messages").deleteOne(MessageToDelete);

		res.sendStatus(200);
	} catch (error) {
		res.sendStatus(404);
	}
});

app.put("/messages/:idMessage", async (req, res) => {
	const id = req.params.idMessage;
	const { user } = req.headers;
	const { error } = schemaMessages.validate(req.body);

	try {
		const MessageToChange = await db
			.collection("messages")
			.findOne({ _id: ObjectId(`${id}`) });

		const isParticipantOnline = await db
			.collection("users")
			.findOne({ name: stripHtml(user.trim()).result });

		if (error || !isParticipantOnline) {
			res.sendStatus(422);
			return;
		}

		if (user !== MessageToChange.from) {
			res.sendStatus(401);
			return;
		}

		await db.collection("messages").updateOne(MessageToChange, {
			$set: {
				...req.body,
				time: dayjs(new Date()).format("HH:mm:ss"),
			},
		});

		res.sendStatus(200);
	} catch (error) {
		res.sendStatus(404);
	}
});

app.post("/status", async (req, res) => {
	const { user } = req.headers;

	try {
		const searchUser = await db
			.collection("users")
			.findOne({ name: stripHtml(user.trim()).result });

		if (!searchUser) {
			res.sendStatus(404);
			return;
		}

		await db
			.collection("users")
			.updateOne(searchUser, { $set: { lastStatus: Date.now() } });

		res.sendStatus(200);
	} catch (error) {
		res.sendStatus(500);
	}
});

function checkInactiveUser(user) {
	const time = Date.now() - 5000;
	if (user.lastStatus < time) {
		return user;
	}
}

setInterval(async () => {
	try {
		const allUsers = await db.collection("users").find().toArray();

		const inactiveUser = allUsers.map((part) => part).filter(checkInactiveUser);

		inactiveUser.forEach(async (item) => {
			let searchUser = allUsers.find((a) => a === item);

			await db.collection("users").deleteOne(searchUser);

			await db.collection("messages").insertOne({
				from: item.name,
				to: "Todos",
				text: "sai da sala...",
				type: "status",
				time: dayjs(new Date()).format("HH:mm:ss"),
			});
		});
	} catch (error) {
		res.sendStatus(500);
	}
}, 15000);

app.listen(process.env.PORT);
