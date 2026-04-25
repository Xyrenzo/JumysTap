package model

import "time"

type Job struct {
	ID                 string    `json:"id"`
	AuthorID           string    `json:"authorId"`
	AuthorName         string    `json:"authorName,omitempty"`
	Title              string    `json:"title"`
	Description        string    `json:"description"`
	JobType            string    `json:"jobType"`
	WorkFormat         string    `json:"workFormat"`
	City               string    `json:"city"`
	Address            string    `json:"address"`
	Salary             string    `json:"salary"`
	ContactPhone       string    `json:"contactPhone,omitempty"`
	Urgent             bool      `json:"urgent"`
	Skills             []string  `json:"skills"`
	Availability       []string  `json:"availability"`
	ExperienceRequired string    `json:"experienceRequired"`
	EventDate          string    `json:"date,omitempty"`
	PeopleNeeded       *int64    `json:"peopleNeeded,omitempty"`
	ImageURL           string    `json:"imageUrl,omitempty"`
	CreatedAt          time.Time `json:"createdAt"`
}

type CreateJobRequest struct {
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	JobType            string   `json:"jobType"`
	WorkFormat         string   `json:"workFormat"`
	City               string   `json:"city"`
	Address            string   `json:"address"`
	Salary             string   `json:"salary"`
	ContactPhone       string   `json:"contactPhone"`
	Urgent             bool     `json:"urgent"`
	Skills             []string `json:"skills"`
	Availability       []string `json:"availability"`
	ExperienceRequired string   `json:"experienceRequired"`
	Date               string   `json:"date,omitempty"`
	PeopleNeeded       *int64   `json:"peopleNeeded,omitempty"`
	ImageURL           string   `json:"imageUrl,omitempty"`
}

type UpdateProfileRequest struct {
	DisplayName    string   `json:"displayName,omitempty"`
	Phone          string   `json:"phone,omitempty"`
	City           string   `json:"city,omitempty"`
	Role           string   `json:"role,omitempty"`
	Bio            string   `json:"bio,omitempty"`
	AvatarURL      string   `json:"avatar,omitempty"`
	Experience     string   `json:"experience,omitempty"`
	JobType        string   `json:"jobType,omitempty"`
	ExpectedSalary *int64   `json:"expectedSalary,omitempty"`
	Skills         []string `json:"skills,omitempty"`
	Availability   []string `json:"availability,omitempty"`
}
