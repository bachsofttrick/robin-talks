export type Level = "Beginner" | "Intermediate" | "Advanced";

export interface Scenario {
  id: string;
  title: string;
  description: string;
  level: Level;
  goal: string;
  robinRole: string;
  setting: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "coffee",
    title: "Ordering coffee",
    description: "A busy café counter at morning rush.",
    level: "Beginner",
    goal: "Order a drink and pay",
    robinRole: "the barista behind the counter",
    setting: "a small city café with a queue behind the learner",
  },
  {
    id: "directions",
    title: "Asking for directions",
    description: "You are lost two streets from the station.",
    level: "Beginner",
    goal: "Find the way to the train station",
    robinRole: "a friendly local on the street",
    setting: "a street corner near a market",
  },
  {
    id: "pharmacy",
    title: "At the pharmacy",
    description: "Describe a mild problem and ask what helps.",
    level: "Beginner",
    goal: "Describe a symptom and buy something for it",
    robinRole: "the pharmacist at the counter",
    setting: "a neighbourhood pharmacy",
  },
  {
    id: "checkin",
    title: "Hotel check-in",
    description: "Your room is not what you booked.",
    level: "Intermediate",
    goal: "Check in and sort out the room problem",
    robinRole: "the hotel receptionist",
    setting: "a hotel front desk in the evening",
  },
  {
    id: "smalltalk",
    title: "Small talk at work",
    description: "A colleague catches you by the kitchen.",
    level: "Intermediate",
    goal: "Keep a short, natural conversation going",
    robinRole: "a colleague you do not know well",
    setting: "an office kitchen on a Monday morning",
  },
  {
    id: "return",
    title: "Returning a purchase",
    description: "The receipt is gone and the shop is strict.",
    level: "Intermediate",
    goal: "Explain the problem and get a refund or exchange",
    robinRole: "a shop assistant who needs convincing",
    setting: "a clothing shop return desk",
  },
  {
    id: "interview",
    title: "Job interview warm-up",
    description: "Three questions about your experience.",
    level: "Advanced",
    goal: "Answer questions about your work clearly",
    robinRole: "a hiring manager running a first interview",
    setting: "a short video interview",
  },
  {
    id: "complaint",
    title: "Making a complaint",
    description: "The order arrived wrong, twice.",
    level: "Advanced",
    goal: "Complain politely and ask for a fix",
    robinRole: "a customer service agent on the phone",
    setting: "a phone call with a delivery company",
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
