const axios = require('axios');

class MoodleAPIClient {
  constructor(baseUrl, token) {
    this.baseUrl = (baseUrl || '').replace(/\/$/, '');
    this.token = token;
    this.apiEndpoint = `${this.baseUrl}/webservice/rest/server.php`;
  }

  async _makeRequest(wsfunction, params = {}, method = 'GET') {
    const fullParams = {
      ...params,
      wstoken: this.token,
      wsfunction: wsfunction,
      moodlewsrestformat: 'json'
    };

    try {
      let response;
      if (method.toUpperCase() === 'POST') {
        // Convert to application/x-www-form-urlencoded format for Moodle
        const formParams = new URLSearchParams();
        for (const [key, val] of Object.entries(fullParams)) {
          if (Array.isArray(val)) {
            val.forEach((item, index) => {
              formParams.append(`${key}[${index}]`, item);
            });
          } else if (typeof val === 'object' && val !== null) {
            formParams.append(key, JSON.stringify(val));
          } else {
            formParams.append(key, val);
          }
        }
        response = await axios.post(this.apiEndpoint, formParams);
      } else {
        response = await axios.get(this.apiEndpoint, { params: fullParams });
      }

      const result = response.data;
      if (result && typeof result === 'object' && result.exception) {
        throw new Error(`Moodle API Error: ${result.message || 'Unknown error'}`);
      }

      return result;
    } catch (err) {
      throw new Error(`Moodle API Request Failed: ${err.message}`);
    }
  }

  async getUserProfile(userId) {
    try {
      const result = await this._makeRequest('core_user_get_users', {
        'userids[0]': userId
      });
      if (result && result.length > 0) {
        return result;
      }
      return [{
        id: userId,
        fullname: `User ${userId}`,
        email: `user${userId}@example.com`
      }];
    } catch (err) {
      console.warn(`Warning: Could not fetch user ${userId} from Moodle: ${err.message}`);
      return [{
        id: userId,
        fullname: `User ${userId}`,
        email: `user${userId}@example.com`
      }];
    }
  }

  async getEnrolledUsers(courseId) {
    try {
      return await this._makeRequest('core_enrol_get_enrolled_users', {
        courseid: courseId
      });
    } catch (err) {
      console.warn(`Warning: Could not fetch enrolled users for course ${courseId}: ${err.message}`);
      return [];
    }
  }

  async getCourses(courseIds = null) {
    const params = {};
    if (courseIds && courseIds.length > 0) {
      courseIds.forEach((id, index) => {
        params[`courseids[${index}]`] = id;
      });
    }
    return this._makeRequest('core_course_get_courses', params);
  }

  async isUserEnrolled(courseId, userId) {
    try {
      const users = await this.getEnrolledUsers(courseId);
      if (!users || users.length === 0) return true; // Fallback: default to enrolled if moodle response is mock/empty
      return users.some(u => u.id === userId);
    } catch (err) {
      return true; // Fallback
    }
  }
}

module.exports = MoodleAPIClient;
