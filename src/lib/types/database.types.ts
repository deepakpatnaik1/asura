export interface Profile {
	id: string;
	email: string;
	full_name?: string;
	avatar_url?: string;
	created_at: string;
	updated_at: string;
}

export interface SuperjournalEntry {
	id: string;
	user_id: string;
	persona_name: string;
	user_message: string;
	ai_response: string;
	is_starred: boolean;
	is_private: boolean;
	created_at: string;
	updated_at: string;
}

export interface JournalEntry {
	id: string;
	superjournal_id?: string;
	user_id: string;
	persona_name: string;
	boss_essence: string;
	persona_essence: string;
	decision_arc_summary: string;
	salience_score: number;
	is_starred: boolean;
	is_private: boolean;
	file_name?: string;
	file_type?: string;
	embedding?: number[];
	created_at: string;
	updated_at: string;
}

export interface ArtisanCutOutput {
	boss_essence: string;
	persona_name: string;
	persona_essence: string;
	decision_arc_summary: string;
	salience_score: number;
}

export interface FileArtisanCutOutput {
	filename: string;
	file_type: 'image' | 'pdf' | 'text' | 'code' | 'spreadsheet' | 'other';
	description: string;
}

export interface SemanticSearchResult {
	id: string;
	user_id: string;
	persona_name: string;
	boss_essence: string;
	persona_essence: string;
	decision_arc_summary: string;
	salience_score: number;
	similarity: number;
	created_at: string;
}

export type PersonaName = 'gunnar' | 'vlad' | 'kirby' | 'stefan' | 'ananya' | 'samara';
