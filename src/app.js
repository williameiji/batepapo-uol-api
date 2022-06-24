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

function connectDB() {
	mongoClient.connect();
	db = mongoClient.db("batepapo_uol");
}

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

	connectDB();
	try {
		const isUserOnline = await db.collection("users").findOne({
			name: name,
		});

		if (isUserOnline) {
			res.sendStatus(409);
			mongoClient.close();
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
		mongoClient.close();
	} catch (error) {
		res.sendStatus(500);
		mongoClient.close();
	}
});

app.get("/participants", async (req, res) => {
	connectDB();

	try {
		const allParticipants = await db.collection("users").find().toArray();

		res.send(allParticipants);
	} catch (error) {
		res.sendStatus(500);
		mongoClient.close();
	}
});

app.post("/messages", async (req, res) => {
	const messageBody = req.body;
	const { user } = req.headers;
	const { error } = schemaMessages.validate(messageBody);

	connectDB();

	try {
		const isParticipantOnline = await db
			.collection("users")
			.findOne({ name: user });

		if (error || !isParticipantOnline) {
			res.sendStatus(422);
			mongoClient.close();
			return;
		}

		await db.collection("messages").insertOne({
			from: stripHtml(user.trim()).result,
			to: stripHtml(messageBody.to.trim()).result,
			text: stripHtml(messageBody.text.trim()).result,
			type: stripHtml(messageBody.type.trim()).result,
			time: dayjs(new Date()).format("HH:mm:ss"),
		});

		res.sendStatus(201);
		mongoClient.close();
	} catch (error) {
		res.sendStatus(500);
		mongoClient.close();
	}
});

app.get("/messages", async (req, res) => {
	const limit = req.query.limit;
	const user = req.headers.user;
	const start = limit * -1;

	connectDB();

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
		mongoClient.close();
	}
});

app.delete("/messages/:idMessage", async (req, res) => {
	const id = req.params.idMessage;
	const { user } = req.headers;

	connectDB();

	try {
		const MessageToDelete = await db
			.collection("messages")
			.findOne({ _id: ObjectId(`${id}`), from: user });

		if (user !== MessageToDelete.from) {
			res.sendStatus(401);
			mongoClient.close();
			return;
		}

		await db.collection("messages").deleteOne(MessageToDelete);

		res.sendStatus(200);
		mongoClient.close();
	} catch (error) {
		res.sendStatus(404);
		mongoClient.close();
	}
});

app.put("/messages/:idMessage", async (req, res) => {
	const id = req.params.idMessage;
	const { to, text, type } = req.body;
	const { user } = req.headers;
	const { error } = schemaMessages.validate({ to, text, type });

	connectDB();

	try {
		const MessageToChange = await db
			.collection("messages")
			.findOne({ _id: ObjectId(`${id}`), from: user });

		const isParticipantOnline = await db
			.collection("users")
			.findOne({ name: user });

		if (error || !isParticipantOnline) {
			res.sendStatus(422);
			mongoClient.close();
			return;
		}

		if (user !== MessageToChange.from) {
			res.sendStatus(401);
			mongoClient.close();
			return;
		}

		await db.collection("messages").updateOne(MessageToChange, {
			$set: {
				from: user,
				to,
				text,
				type,
				time: dayjs(new Date()).format("HH:mm:ss"),
			},
		});

		res.sendStatus(200);
		mongoClient.close();
	} catch (error) {
		res.sendStatus(404);
		mongoClient.close();
	}
});

app.post("/status", async (req, res) => {
	const user = req.headers.user;

	connectDB();

	try {
		const searchUser = await db.collection("users").findOne({ name: user });

		if (!searchUser) {
			res.sendStatus(404);
			mongoClient.close();
			return;
		}

		await db
			.collection("users")
			.updateOne(searchUser, { $set: { name: user, lastStatus: Date.now() } });

		res.sendStatus(200);
	} catch (error) {
		res.sendStatus(500);
		mongoClient.close();
	}
});

function checkInactiveUser(user) {
	const time = Date.now() - 5000;
	if (user.lastStatus < time) {
		return user;
	}
}

setInterval(async () => {
	connectDB();

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

			mongoClient.close();
		});
	} catch (error) {
		res.sendStatus(500);
		mongoClient.close();
	}
}, 15000);

app.listen(process.env.PORT);
